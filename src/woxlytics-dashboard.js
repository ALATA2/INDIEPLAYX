import {
  fetchWoxlyticsFromCloud,
  loadWoxlyticsLocal,
  resetWoxlyticsData,
  isWoxlyticsEnabledInCloud,
  getCountryMeta
} from './woxlytics-tracker.js';
import { sha256Hex, checkRateLimit, resetRateLimit } from './security.js';

// Stessi hash SHA-256 di /bitmeme (Backend & Redazione) — zero password in chiaro
const WOX_BACKEND_HASH = 'c94e1e094df381b87be436ce966fc5a4b20280dffdf0624e0d60b978499101a6';
const WOX_MAGAZINE_HASH = 'f5cc70f88b12210cbd1758da2ba5e8de99787c31e70930538d0436be9756470a';
const WOX_UNLOCK_KEY = 'indieplay_woxlytics_unlocked_v1';

function isWoxlyticsSessionUnlocked() {
  try {
    return (
      sessionStorage.getItem(WOX_UNLOCK_KEY) === 'true' ||
      sessionStorage.getItem('indieplay_backend_unlocked_v1') === 'true' ||
      sessionStorage.getItem('indieplay_mag_unlocked_v1') === 'true'
    );
  } catch (e) {
    return false;
  }
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pct(part, total) {
  if (!total || total <= 0) return '0.0';
  return ((Number(part || 0) / Number(total)) * 100).toFixed(1);
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${String(rem).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

function getDateKeys(daysCount) {
  const keys = [];
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

function sortEntriesDesc(obj, getVal = (v) => Number(v || 0)) {
  return Object.entries(obj || {})
    .map(([k, v]) => [k, v, getVal(v)])
    .filter(([, , n]) => n > 0)
    .sort((a, b) => b[2] - a[2]);
}

const LANG_NAMES = {
  it: '🇮🇹 Italiano',
  en: '🇬🇧 Inglese',
  es: '🇪🇸 Spagnolo',
  fr: '🇫🇷 Francese',
  de: '🇩🇪 Tedesco',
  pt: '🇵🇹 Portoghese',
  ru: '🇷🇺 Russo',
  ja: '🇯🇵 Giapponese',
  ko: '🇰🇷 Coreano',
  zh: '🇨🇳 Cinese',
  nl: '🇳🇱 Olandese',
  pl: '🇵🇱 Polacco',
  tr: '🇹🇷 Turco',
  ar: '🇸🇦 Arabo',
  ro: '🇷🇴 Rumeno'
};

const PAGE_LABELS = {
  home: { label: 'Homepage & Catalogo Giochi', icon: 'fa-home', color: '#38bdf8' },
  game: { label: 'Schede Gioco & Download', icon: 'fa-gamepad', color: '#34d399' },
  showcase: { label: 'Spazi Social & Vetrine Creatori', icon: 'fa-store', color: '#fbbf24' },
  account: { label: 'Area Account & Pubblicazione', icon: 'fa-user-cog', color: '#c084fc' },
  other: { label: 'Altre Pagine', icon: 'fa-file-alt', color: '#94a3b8' }
};

const SOURCE_LABELS = {
  direct: { label: 'Traffico Diretto', icon: 'fa-bolt', color: '#38bdf8' },
  social: { label: 'Social Media', icon: 'fa-share-nodes', color: '#f472b6' },
  search: { label: 'Motori di Ricerca (SEO / AI)', icon: 'fa-magnifying-glass', color: '#34d399' },
  referral: { label: 'Referral / Siti Esterni', icon: 'fa-link', color: '#fbbf24' },
  campaign: { label: 'Campagne UTM / Email', icon: 'fa-bullhorn', color: '#a78bfa' }
};

const DURATION_BUCKET_META = [
  { key: 'lt10', label: '< 10 sec (Rimbalzo rapido)', color: '#f87171' },
  { key: 's10_30', label: '10s – 30s (Lettura veloce)', color: '#fb923c' },
  { key: 's30_60', label: '30s – 1 min (Interesse)', color: '#fbbf24' },
  { key: 'm1_3', label: '1 min – 3 min (Buono)', color: '#38bdf8' },
  { key: 'm3_10', label: '3 min – 10 min (Alto)', color: '#34d399' },
  { key: 'gt10m', label: '> 10 min (Super Coinvolto)', color: '#a78bfa' }
];

function renderProgressRows(items, total, emptyMsg = 'Nessun dato ancora registrato.') {
  if (!items.length) {
    return `<div style="color:#64748b; font-size:0.82rem; padding:1rem 0; text-align:center;">${emptyMsg}</div>`;
  }
  return items
    .map(({ label, sub, count, color = '#38bdf8' }) => {
      const p = pct(count, total);
      const barWidth = Math.max(2, Math.min(100, parseFloat(p)));
      return `
        <div style="margin-bottom: 0.72rem;">
          <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px; font-size:0.82rem; margin-bottom:4px;">
            <span style="color:#e2e8f0; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(label)}">
              ${label} ${sub ? `<span style="color:#94a3b8; font-weight:500; font-size:0.74rem;">${sub}</span>` : ''}
            </span>
            <span style="white-space:nowrap; font-weight:800; color:#f8fafc;">
              ${count.toLocaleString('it-IT')} <span style="color:${color}; font-size:0.76rem; margin-left:4px;">(${p}%)</span>
            </span>
          </div>
          <div style="height:7px; background:rgba(255,255,255,0.06); border-radius:999px; overflow:hidden;">
            <div style="height:100%; width:${barWidth}%; background:${color}; border-radius:999px; transition:width 0.4s ease;"></div>
          </div>
        </div>
      `;
    })
    .join('');
}

export function initWoxlyticsDashboard() {
  const root = document.getElementById('woxlytics-app-root');
  if (!root) return;

  let currentStats = loadWoxlyticsLocal();
  let selectedDays = 14;
  let logFilter = 'all'; // all | humans | bots | mobile | desktop
  let logSearch = '';
  let autoRefreshOn = false;
  let autoRefreshTimer = null;
  let isLoading = false;
  let woxlyticsEnabled = true;

  const renderAuthGate = () => {
    root.innerHTML = `
      <div style="max-width: 460px; margin: 3rem auto; background: rgba(15, 23, 38, 0.94); border: 1px solid rgba(56, 189, 248, 0.45); border-radius: 18px; padding: 2.2rem; box-shadow: 0 24px 60px rgba(0,0,0,0.65); text-align: center;">
        <div style="width: 64px; height: 64px; margin: 0 auto 1rem; border-radius: 16px; background: rgba(56, 189, 248, 0.14); border: 1px solid rgba(56, 189, 248, 0.5); display: flex; align-items: center; justify-content: center;">
          <i class="fas fa-shield-halved" style="font-size: 1.85rem; color: #38bdf8;"></i>
        </div>
        <span style="font-size: 0.72rem; font-weight: 900; color: #38bdf8; letter-spacing: 1px; text-transform: uppercase;">ACCESSO RISERVATO PROTETTO (SHA-256)</span>
        <h2 style="margin: 6px 0 8px; font-size: 1.45rem; font-weight: 900; color: #fff;">Sblocca Woxlytics Analytics</h2>
        <p style="margin: 0 0 1.4rem; font-size: 0.85rem; color: #94a3b8; line-height: 1.5;">
          Inserisci la password amministrativa (Backend o Redazione) per visualizzare i dati analitici privati di INDIE PLAY X, oppure accedi direttamente da <code>/bitmeme</code>.
        </p>

        <form id="wx-auth-form" style="display: flex; flex-direction: column; gap: 12px; text-align: left;">
          <label for="wx-auth-pwd" style="font-size: 0.76rem; font-weight: 800; color: #cbd5e1; text-transform: uppercase;">Password Amministratore</label>
          <input type="password" id="wx-auth-pwd" required autocomplete="current-password" placeholder="Inserisci password..." style="width: 100%; padding: 0.85rem 1rem; border-radius: 10px; border: 1px solid rgba(56, 189, 248, 0.35); background: rgba(0, 5, 13, 0.8); color: #fff; font-size: 0.95rem;">
          <button type="submit" class="wx-btn wx-btn-cyan" style="justify-content: center; padding: 0.85rem; font-size: 0.9rem; margin-top: 4px;">
            <i class="fas fa-unlock-keyhole"></i> Sblocca Dashboard Woxlytics
          </button>
        </form>

        <div style="margin-top: 1.3rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem;">
          <a href="/bitmeme" style="color: #fbbf24; text-decoration: none; font-weight: 800;"><i class="fas fa-user-shield"></i> Vai a /bitmeme</a>
          <a href="/" style="color: #94a3b8; text-decoration: none; font-weight: 700;"><i class="fas fa-home"></i> Homepage</a>
        </div>
      </div>
    `;

    const form = document.getElementById('wx-auth-form');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const rl = checkRateLimit('woxlytics_auth', 5, 60000);
        if (!rl.allowed) {
          if (window.showToast) window.showToast(`Troppi tentativi falliti. Riprova tra ${rl.remainingSec}s.`, 'error');
          return;
        }
        const pwd = document.getElementById('wx-auth-pwd')?.value || '';
        const digest = await sha256Hex(pwd);
        if (digest === WOX_BACKEND_HASH || digest === WOX_MAGAZINE_HASH) {
          resetRateLimit('woxlytics_auth');
          sessionStorage.setItem(WOX_UNLOCK_KEY, 'true');
          if (window.showToast) window.showToast('Accesso Woxlytics autorizzato!', 'success');
          render();
          refreshFromCloud(false);
        } else {
          if (window.showToast) window.showToast('Password errata! Accesso negato.', 'error');
        }
      };
    }
  };

  const exportCSV = () => {
    const s = currentStats;
    const rows = [
      ['SEZIONE', 'VOCE', 'VALORE_NUMERICO', 'PERCENTUALE'],
      ['RIEPILOGO', 'Visite Totali', s.totals.views, '100%'],
      ['RIEPILOGO', 'Sessioni Uniche', s.totals.uniqueSessions, ''],
      ['RIEPILOGO', 'Visitatori Unici', s.totals.uniqueVisitors, ''],
      ['RIEPILOGO', 'Nuovi Visitatori', s.totals.newVisitors, pct(s.totals.newVisitors, s.totals.uniqueSessions) + '%'],
      ['RIEPILOGO', 'Visitatori Di Ritorno', s.totals.returningVisitors, pct(s.totals.returningVisitors, s.totals.uniqueSessions) + '%'],
      ['RIEPILOGO', 'Visite Umani', s.totals.humanViews, pct(s.totals.humanViews, s.totals.views) + '%'],
      ['RIEPILOGO', 'Umani Verificati (Interazione)', s.totals.humanVerifiedViews, pct(s.totals.humanVerifiedViews, s.totals.humanViews) + '%'],
      ['RIEPILOGO', 'Visite Bot / Crawler', s.totals.botViews, pct(s.totals.botViews, s.totals.views) + '%'],
      ['RIEPILOGO', 'Tempo Medio Permanenza (sec)', s.totals.durationSamples ? Math.round(s.totals.totalDurationSec / s.totals.durationSamples) : 0, ''],
      ['RIEPILOGO', 'Frequenza Rimbalzo (Bounce)', s.totals.bounces, pct(s.totals.bounces, s.totals.uniqueSessions) + '%'],
      ['', '', '', '']
    ];

    Object.entries(s.countries || {}).forEach(([cc, n]) => {
      rows.push(['PAESE', `${getCountryMeta(cc).name} (${cc})`, n, pct(n, s.totals.views) + '%']);
    });
    Object.entries(s.devices || {}).forEach(([d, n]) => {
      rows.push(['DISPOSITIVO', d, n, pct(n, s.totals.views) + '%']);
    });
    Object.entries(s.os || {}).forEach(([o, n]) => {
      rows.push(['OS', o, n, pct(n, s.totals.views) + '%']);
    });
    Object.entries(s.browsers || {}).forEach(([b, n]) => {
      rows.push(['BROWSER', b, n, pct(n, s.totals.views) + '%']);
    });
    Object.entries(s.languages || {}).forEach(([l, n]) => {
      rows.push(['LINGUA', l.toUpperCase(), n, pct(n, s.totals.views) + '%']);
    });
    Object.entries(s.sources || {}).forEach(([src, n]) => {
      rows.push(['SORGENTE', src, n, pct(n, s.totals.views) + '%']);
    });
    Object.entries(s.socialPlatforms || {}).forEach(([sp, n]) => {
      rows.push(['SOCIAL', sp, n, pct(n, s.sources.social || s.totals.views) + '%']);
    });
    Object.entries(s.pages || {}).forEach(([pg, obj]) => {
      rows.push(['PAGINA', pg, obj.views || 0, pct(obj.views || 0, s.totals.views) + '%']);
    });
    Object.entries(s.dailyHistory || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([day, obj]) => {
        rows.push(['GIORNALIERO', day, obj.views || 0, `Unici:${obj.uniques || 0} Umani:${obj.humans || 0} Bot:${obj.bots || 0}`]);
      });

    const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Woxlytics_IndiePlayX_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(currentStats, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Woxlytics_IndiePlayX_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const refreshFromCloud = async (showNotice = false) => {
    if (!isWoxlyticsSessionUnlocked()) {
      renderAuthGate();
      return;
    }
    isLoading = true;
    render();
    const [cloudStats, enabledState] = await Promise.all([
      fetchWoxlyticsFromCloud(),
      isWoxlyticsEnabledInCloud()
    ]);
    currentStats = cloudStats;
    woxlyticsEnabled = enabledState;
    isLoading = false;
    render();
    if (showNotice && window.showToast) {
      window.showToast('Dati Woxlytics sincronizzati in tempo reale dal Cloud!', 'success');
    }
  };

  const render = () => {
    if (!isWoxlyticsSessionUnlocked()) {
      renderAuthGate();
      return;
    }
    const s = currentStats;
    const t = s.totals || {};
    const totalViews = Number(t.views || 0);
    const totalSessions = Number(t.uniqueSessions || 0);
    const humanViews = Number(t.humanViews || 0);
    const humanVerifiedViews = Number(t.humanVerifiedViews || 0);
    const botViews = Number(t.botViews || 0);

    const todayKey = new Date().toISOString().slice(0, 10);
    const todayData = s.dailyHistory?.[todayKey] || { views: 0, uniques: 0, humans: 0, bots: 0 };

    const avgDwellSec = t.durationSamples > 0 ? Math.round(t.totalDurationSec / t.durationSamples) : 0;
    const pagesPerSession = totalSessions > 0 ? (totalViews / totalSessions).toFixed(2) : '0.00';
    const bounceRate = pct(t.bounces, Math.max(1, totalSessions));
    const humanPct = pct(humanViews, totalViews);
    const botPct = pct(botViews, totalViews);
    const verifiedPctOfHumans = pct(humanVerifiedViews, humanViews);

    // Recent active visits (last 30 minutes)
    const nowMs = Date.now();
    const activeLast30m = (s.recentVisits || []).filter((v) => nowMs - new Date(v.ts).getTime() <= 30 * 60 * 1000).length;

    // Devices
    const totalDev = (s.devices.desktop || 0) + (s.devices.mobile || 0) + (s.devices.tablet || 0);
    const desktopPct = pct(s.devices.desktop, totalDev);
    const mobilePct = pct(s.devices.mobile, totalDev);
    const tabletPct = pct(s.devices.tablet, totalDev);

    // Countries sorted
    const sortedCountries = sortEntriesDesc(s.countries);
    const topCountry = sortedCountries[0];
    const topCountryMeta = topCountry ? getCountryMeta(topCountry[0]) : { flag: '🌍', name: 'N/D' };

    // Cities sorted
    const sortedCities = sortEntriesDesc(s.cities).slice(0, 12);

    // OS, Browsers, Screens, Languages
    const sortedOS = sortEntriesDesc(s.os);
    const sortedBrowsers = sortEntriesDesc(s.browsers);
    const sortedScreens = sortEntriesDesc(s.screens).slice(0, 10);
    const sortedLangs = sortEntriesDesc(s.languages);
    const sortedBrowserLangs = sortEntriesDesc(s.browserLanguages).slice(0, 10);

    // Sources, Social, Search, Referrers, Bots
    const sortedSources = sortEntriesDesc(s.sources);
    const sortedSocial = sortEntriesDesc(s.socialPlatforms);
    const sortedSearch = sortEntriesDesc(s.searchEngines);
    const sortedReferrers = sortEntriesDesc(s.referrers).slice(0, 12);
    const sortedBotTypes = sortEntriesDesc(s.botTypes);

    // Top Paths
    const sortedPaths = sortEntriesDesc(s.topPaths, (v) => Number(v?.views || 0)).slice(0, 15);

    // Daily chart
    const dateKeys = getDateKeys(selectedDays);
    const maxDayVal = Math.max(5, ...dateKeys.map((d) => Number(s.dailyHistory?.[d]?.views || 0)));

    // Hourly chart (00 - 23)
    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const maxHourVal = Math.max(3, ...hours.map((h) => Number(s.hourlyDistribution?.[h] || 0)));

    // Duration buckets total
    const totalBuckets = Object.values(s.durationBuckets || {}).reduce((acc, v) => acc + Number(v || 0), 0);

    // Filtered recent visits log
    const filteredVisits = (s.recentVisits || []).filter((v) => {
      if (logFilter === 'humans' && v.isBot) return false;
      if (logFilter === 'bots' && !v.isBot) return false;
      if (logFilter === 'mobile' && v.device !== 'mobile') return false;
      if (logFilter === 'desktop' && v.device !== 'desktop') return false;
      if (logSearch.trim()) {
        const q = logSearch.trim().toLowerCase();
        const hay = `${v.country} ${getCountryMeta(v.country).name} ${v.city} ${v.path} ${v.title} ${v.sourceDetail} ${v.os} ${v.browser} ${v.botCategory || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    root.innerHTML = `
      <!-- TOP CONTROL BAR -->
      <div class="wx-toolbar">
        <div class="wx-toolbar-left">
          <div class="wx-live-pill">
            <span class="wx-pulse-dot"></span>
            <span>LIVE TRACKING ATTIVO</span>
            <strong style="color:#34d399; margin-left:6px;">${activeLast30m} visite ultimi 30m</strong>
          </div>
          <span class="wx-muted-meta">
            Ultimo evento: ${s.lastVisitAt ? new Date(s.lastVisitAt).toLocaleString('it-IT') : 'In attesa della prima visita...'}
          </span>
        </div>

        <div class="wx-toolbar-actions">
          <div class="wx-seg-group">
            <button type="button" class="wx-seg-btn ${selectedDays === 7 ? 'active' : ''}" data-days="7">7G</button>
            <button type="button" class="wx-seg-btn ${selectedDays === 14 ? 'active' : ''}" data-days="14">14G</button>
            <button type="button" class="wx-seg-btn ${selectedDays === 30 ? 'active' : ''}" data-days="30">30G</button>
          </div>
          <button type="button" id="wx-btn-refresh" class="wx-btn wx-btn-cyan" ${isLoading ? 'disabled' : ''}>
            <i class="fas fa-sync-alt ${isLoading ? 'fa-spin' : ''}"></i> Aggiorna
          </button>
          <button type="button" id="wx-btn-autorefresh" class="wx-btn ${autoRefreshOn ? 'wx-btn-emerald' : 'wx-btn-ghost'}">
            <i class="fas fa-clock"></i> Auto 30s: ${autoRefreshOn ? 'ON' : 'OFF'}
          </button>
          <button type="button" id="wx-btn-csv" class="wx-btn wx-btn-ghost">
            <i class="fas fa-file-csv"></i> CSV
          </button>
          <button type="button" id="wx-btn-json" class="wx-btn wx-btn-ghost">
            <i class="fas fa-code"></i> JSON
          </button>
          <button type="button" id="wx-btn-reset" class="wx-btn wx-btn-danger" title="Azzera tutte le statistiche Woxlytics">
            <i class="fas fa-trash-alt"></i> Reset
          </button>
          <a href="/bitmeme" class="wx-btn wx-btn-ghost" style="text-decoration:none; border-color:rgba(245,158,11,0.4); color:#fbbf24;">
            <i class="fas fa-user-shield"></i> /bitmeme
          </a>
          <button type="button" id="wx-btn-lock" class="wx-btn wx-btn-danger" title="Blocca sessione Woxlytics">
            <i class="fas fa-lock"></i> Blocca
          </button>
        </div>
      </div>

      ${!woxlyticsEnabled ? `
        <div class="wx-empty-banner" style="background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.55);">
          <i class="fas fa-pause-circle" style="font-size:1.6rem; color:#fbbf24;"></i>
          <div style="flex:1;">
            <strong style="color:#fbbf24;">Woxlytics è attualmente DISATTIVATO da /bitmeme</strong>
            <p style="margin:4px 0 0; color:#cbd5e1; font-size:0.84rem;">
              Il tracciamento di nuove visite è in pausa. Puoi continuare a consultare o esportare i dati storici qui sotto, oppure riattivarlo subito dalla console <code>/bitmeme</code>.
            </p>
          </div>
          <a href="/bitmeme" class="wx-btn wx-btn-cyan" style="text-decoration:none;">
            <i class="fas fa-play-circle"></i> Riattiva in /bitmeme
          </a>
        </div>
      ` : ''}

      ${totalViews === 0 ? `
        <div class="wx-empty-banner">
          <i class="fas fa-satellite-dish" style="font-size:1.6rem; color:#38bdf8;"></i>
          <div>
            <strong>Woxlytics è attivo e pronto!</strong>
            <p style="margin:4px 0 0; color:#94a3b8; font-size:0.85rem;">
              Tutti i dati mostrati qui sono <strong>100% reali</strong> (nessun numero simulato). Appena i visitatori apriranno la Homepage, un gioco o una vetrina social, vedrai apparire qui in tempo reale nazioni, bot vs umani, tempo di permanenza, dispositivi e sorgenti.
            </p>
          </div>
        </div>
      ` : ''}

      <!-- 8 MAIN KPI CARDS -->
      <div class="wx-kpi-grid">
        <div class="wx-kpi-card" style="--accent:#38bdf8;">
          <div class="wx-kpi-head">
            <span>Visite Totali (Pageviews)</span>
            <i class="fas fa-eye"></i>
          </div>
          <div class="wx-kpi-value">${totalViews.toLocaleString('it-IT')}</div>
          <div class="wx-kpi-sub">Oggi: <strong style="color:#38bdf8;">+${todayData.views}</strong> visite (${todayData.uniques} unici)</div>
        </div>

        <div class="wx-kpi-card" style="--accent:#34d399;">
          <div class="wx-kpi-head">
            <span>Visitatori Unici & Sessioni</span>
            <i class="fas fa-users"></i>
          </div>
          <div class="wx-kpi-value">${Number(t.uniqueVisitors || 0).toLocaleString('it-IT')}</div>
          <div class="wx-kpi-sub">
            Nuovi: <strong>${pct(t.newVisitors, totalSessions)}%</strong> • Di ritorno: <strong>${pct(t.returningVisitors, totalSessions)}%</strong>
          </div>
        </div>

        <div class="wx-kpi-card" style="--accent:#22c55e;">
          <div class="wx-kpi-head">
            <span>Umani vs Bot / Crawler</span>
            <i class="fas fa-robot"></i>
          </div>
          <div class="wx-kpi-value">${humanPct}% <span style="font-size:0.9rem; color:#94a3b8;">Umani</span></div>
          <div class="wx-kpi-sub">
            <span style="color:#4ade80;">Umani: ${humanViews}</span> • <span style="color:#f87171;">Bot: ${botViews} (${botPct}%)</span>
          </div>
        </div>

        <div class="wx-kpi-card" style="--accent:#fbbf24;">
          <div class="wx-kpi-head">
            <span>Tempo Medio Permanenza</span>
            <i class="fas fa-hourglass-half"></i>
          </div>
          <div class="wx-kpi-value">${formatDuration(avgDwellSec)}</div>
          <div class="wx-kpi-sub">Totale cumulato: <strong>${formatDuration(t.totalDurationSec)}</strong></div>
        </div>

        <div class="wx-kpi-card" style="--accent:#c084fc;">
          <div class="wx-kpi-head">
            <span>Pagine / Sessione</span>
            <i class="fas fa-layer-group"></i>
          </div>
          <div class="wx-kpi-value">${pagesPerSession}</div>
          <div class="wx-kpi-sub">Sessioni totali: <strong>${totalSessions.toLocaleString('it-IT')}</strong></div>
        </div>

        <div class="wx-kpi-card" style="--accent:#f87171;">
          <div class="wx-kpi-head">
            <span>Frequenza di Rimbalzo</span>
            <i class="fas fa-arrow-right-from-bracket"></i>
          </div>
          <div class="wx-kpi-value">${bounceRate}%</div>
          <div class="wx-kpi-sub">${Number(t.bounces || 0)} sessioni brevi (&lt;15s, 1 pag.)</div>
        </div>

        <div class="wx-kpi-card" style="--accent:#f472b6;">
          <div class="wx-kpi-head">
            <span>PC vs Mobile / Tablet</span>
            <i class="fas fa-mobile-screen-button"></i>
          </div>
          <div class="wx-kpi-value">${desktopPct}% <span style="font-size:0.9rem; color:#94a3b8;">PC</span></div>
          <div class="wx-kpi-sub">Mobile: <strong>${mobilePct}%</strong> • Tablet: <strong>${tabletPct}%</strong></div>
        </div>

        <div class="wx-kpi-card" style="--accent:#60a5fa;">
          <div class="wx-kpi-head">
            <span>Paese Principale</span>
            <i class="fas fa-earth-europe"></i>
          </div>
          <div class="wx-kpi-value" style="font-size:1.35rem;">${topCountryMeta.flag} ${esc(topCountryMeta.name)}</div>
          <div class="wx-kpi-sub">
            ${topCountry ? `${topCountry[2]} visite (${pct(topCountry[2], totalViews)}%) • ${sortedCountries.length} nazioni` : 'Nessuna nazione rilevata'}
          </div>
        </div>
      </div>

      <!-- CHARTS ROW: DAILY TREND & 24H DISTRIBUTION -->
      <div class="wx-grid-2-wide">
        <section class="wx-panel">
          <div class="wx-panel-head">
            <h3><i class="fas fa-chart-column" style="color:#38bdf8;"></i> Andamento Visite Giornaliere (Ultimi ${selectedDays} Giorni)</h3>
            <span class="wx-badge">Umani + Bot + Unici</span>
          </div>
          <div class="wx-bar-chart">
            ${dateKeys.map((d) => {
              const obj = s.dailyHistory?.[d] || { views: 0, uniques: 0, humans: 0, bots: 0 };
              const hPct = obj.views > 0 ? Math.max(8, Math.round((obj.views / maxDayVal) * 100)) : 2;
              const isToday = d === todayKey;
              return `
                <div class="wx-bar-col" title="${d}: ${obj.views} visite | ${obj.uniques} unici | ${obj.humans || 0} umani | ${obj.bots || 0} bot">
                  <span class="wx-bar-num" style="color:${isToday ? '#fbbf24' : '#cbd5e1'};">${obj.views || ''}</span>
                  <div class="wx-bar-fill ${isToday ? 'today' : ''}" style="height:${hPct}%;"></div>
                  <span class="wx-bar-lbl">${d.slice(5)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </section>

        <section class="wx-panel">
          <div class="wx-panel-head">
            <h3><i class="fas fa-clock" style="color:#fbbf24;"></i> Fasce Orarie di Traffico (00:00 – 23:00)</h3>
            <span class="wx-badge">Picchi di connessione</span>
          </div>
          <div class="wx-bar-chart wx-bar-chart-compact">
            ${hours.map((h) => {
              const val = Number(s.hourlyDistribution?.[h] || 0);
              const hPct = val > 0 ? Math.max(10, Math.round((val / maxHourVal) * 100)) : 3;
              return `
                <div class="wx-bar-col" title="Ore ${h}:00–${h}:59 → ${val} visite (${pct(val, totalViews)}%)">
                  <span class="wx-bar-num" style="font-size:0.62rem;">${val > 0 ? val : ''}</span>
                  <div class="wx-bar-fill amber" style="height:${hPct}%;"></div>
                  <span class="wx-bar-lbl" style="font-size:0.6rem;">${Number(h) % 2 === 0 ? h : ''}</span>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      </div>

      <!-- HUMANS VS BOTS & DWELL TIME DISTRIBUTION -->
      <div class="wx-grid-2">
        <section class="wx-panel">
          <div class="wx-panel-head">
            <h3><i class="fas fa-shield-virus" style="color:#4ade80;"></i> Rilevamento Umani vs Bot / Crawler</h3>
            <span class="wx-badge">Analisi User-Agent + Comportamento</span>
          </div>

          <div style="margin-bottom:1.1rem;">
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:800; margin-bottom:6px;">
              <span style="color:#4ade80;"><i class="fas fa-user-check"></i> Umani: ${humanViews} (${humanPct}%)</span>
              <span style="color:#f87171;"><i class="fas fa-robot"></i> Bot: ${botViews} (${botPct}%)</span>
            </div>
            <div style="display:flex; height:14px; border-radius:999px; overflow:hidden; background:rgba(255,255,255,0.06);">
              <div style="width:${humanPct}%; background:linear-gradient(90deg, #22c55e, #4ade80);"></div>
              <div style="width:${botPct}%; background:linear-gradient(90deg, #ef4444, #f87171);"></div>
            </div>
            <div style="font-size:0.76rem; color:#94a3b8; margin-top:6px;">
              Umani con interazione fisica confermata (mouse/touch/scroll): <strong style="color:#34d399;">${humanVerifiedViews} (${verifiedPctOfHumans}% degli umani)</strong>
            </div>
          </div>

          <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:0.9rem;">
            <div style="font-size:0.78rem; font-weight:800; color:#cbd5e1; margin-bottom:0.6rem; text-transform:uppercase;">
              Tipologie di Bot Rilevate
            </div>
            ${renderProgressRows(
              sortedBotTypes.map(([k, , n]) => ({ label: `🤖 ${esc(k)}`, count: n, color: '#f87171' })),
              Math.max(1, botViews),
              'Nessun bot rilevato finora — traffico pulito al 100%.'
            )}
          </div>
        </section>

        <section class="wx-panel">
          <div class="wx-panel-head">
            <h3><i class="fas fa-stopwatch" style="color:#fbbf24;"></i> Distribuzione Tempo di Permanenza</h3>
            <span class="wx-badge">Media: ${formatDuration(avgDwellSec)}</span>
          </div>
          ${renderProgressRows(
            DURATION_BUCKET_META.map((b) => ({
              label: b.label,
              count: Number(s.durationBuckets?.[b.key] || 0),
              color: b.color
            })),
            Math.max(1, totalBuckets),
            'In attesa di campioni di permanenza...'
          )}
        </section>
      </div>

      <!-- GEOGRAPHY: COUNTRIES & CITIES -->
      <div class="wx-grid-2">
        <section class="wx-panel">
          <div class="wx-panel-head">
            <h3><i class="fas fa-globe" style="color:#60a5fa;"></i> Provenienza Geografica (Paesi)</h3>
            <span class="wx-badge">${sortedCountries.length} Nazioni</span>
          </div>
          ${renderProgressRows(
            sortedCountries.slice(0, 15).map(([cc, , n]) => {
              const meta = getCountryMeta(cc);
              return { label: `${meta.flag} ${esc(meta.name)}`, sub: `(${cc})`, count: n, color: '#60a5fa' };
            }),
            totalViews,
            'Nessun Paese ancora registrato.'
          )}
        </section>

        <section class="wx-panel">
          <div class="wx-panel-head">
            <h3><i class="fas fa-location-dot" style="color:#38bdf8;"></i> Top Città / Aree di Connessione</h3>
            <span class="wx-badge">Geo-IP + Fuso Orario</span>
          </div>
          ${renderProgressRows(
            sortedCities.map(([city, , n]) => ({ label: `📍 ${esc(city)}`, count: n, color: '#38bdf8' })),
            totalViews,
            'Nessuna città ancora registrata.'
          )}
        </section>
      </div>

      <!-- CONTENT: WHAT THEY VISIT (SECTIONS & TOP URLS) -->
      <div class="wx-grid-2">
        <section class="wx-panel">
          <div class="wx-panel-head">
            <h3><i class="fas fa-compass" style="color:#34d399;"></i> Cosa Visitano — Sezioni del Portale</h3>
            <span class="wx-badge">Visite + Tempo Medio</span>
          </div>
          ${renderProgressRows(
            Object.entries(PAGE_LABELS).map(([key, meta]) => {
              const pg = s.pages?.[key] || { views: 0, durationSec: 0, samples: 0 };
              const avgPg = pg.samples > 0 ? Math.round(pg.durationSec / pg.samples) : 0;
              return {
                label: `<i class="fas ${meta.icon}" style="color:${meta.color}; width:18px;"></i> ${meta.label}`,
                sub: pg.views > 0 ? `• ⏱ ${formatDuration(avgPg)} media` : '',
                count: Number(pg.views || 0),
                color: meta.color
              };
            }).sort((a, b) => b.count - a.count),
            totalViews
          )}
        </section>

        <section class="wx-panel">
          <div class="wx-panel-head">
            <h3><i class="fas fa-fire" style="color:#fb923c;"></i> Top Pagine & Contenuti Specifici</h3>
            <span class="wx-badge">Classifica URL</span>
          </div>
          <div class="wx-scroll-list">
            ${renderProgressRows(
              sortedPaths.map(([pathStr, obj, n]) => {
                const avgP = n > 0 ? Math.round((Number(obj?.durationSec || 0)) / n) : 0;
                return {
                  label: `<a href="${esc(pathStr)}" target="_blank" style="color:#e2e8f0; text-decoration:none;">${esc(pathStr)}</a>`,
                  sub: `• ⏱ ${formatDuration(avgP)}`,
                  count: n,
                  color: '#fb923c'
                };
              }),
              totalViews,
              'Nessuna pagina visitata ancora.'
            )}
          </div>
        </section>
      </div>

      <!-- TRAFFIC SOURCES: CHANNELS, SOCIAL, SEARCH, REFERRERS -->
      <div class="wx-grid-3">
        <section class="wx-panel">
          <div class="wx-panel-head">
            <h3><i class="fas fa-route" style="color:#f472b6;"></i> Canali di Acquisizione</h3>
            <span class="wx-badge">Origine Traffico</span>
          </div>
          ${renderProgressRows(
            Object.entries(SOURCE_LABELS).map(([k, meta]) => ({
              label: `<i class="fas ${meta.icon}" style="color:${meta.color}; width:18px;"></i> ${meta.label}`,
              count: Number(s.sources?.[k] || 0),
              color: meta.color
            })).sort((a, b) => b.count - a.count),
            totalViews
          )}
        </section>

        <section class="wx-panel">
          <div class="wx-panel-head">
            <h3><i class="fas fa-hashtag" style="color:#ec4899;"></i> Provenienza Social Media</h3>
            <span class="wx-badge">Piattaforme</span>
          </div>
          ${renderProgressRows(
            sortedSocial.map(([plat, , n]) => ({ label: esc(plat), count: n, color: '#ec4899' })),
            Math.max(1, Number(s.sources?.social || 0)),
            'Nessun traffico da Social Media ancora registrato.'
          )}
        </section>

        <section class="wx-panel">
          <div class="wx-panel-head">
            <h3><i class="fas fa-magnifying-glass" style="color:#34d399;"></i> Motori di Ricerca & Referral</h3>
            <span class="wx-badge">SEO & Domini</span>
          </div>
          <div style="font-size:0.75rem; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:6px;">Motori di Ricerca</div>
          ${renderProgressRows(
            sortedSearch.map(([eng, , n]) => ({ label: `🔍 ${esc(eng)}`, count: n, color: '#34d399' })),
            Math.max(1, Number(s.sources?.search || 0)),
            'Nessuna visita da motori di ricerca ancora.'
          )}
          <div style="font-size:0.75rem; font-weight:800; color:#94a3b8; text-transform:uppercase; margin:12px 0 6px; border-top:1px solid rgba(255,255,255,0.08); padding-top:10px;">Top Siti Referral</div>
          ${renderProgressRows(
            sortedReferrers.map(([host, , n]) => ({ label: `🔗 ${esc(host)}`, count: n, color: '#fbbf24' })),
            Math.max(1, Number(s.sources?.referral || 0)),
            'Nessun referral esterno ancora.'
          )}
        </section>
      </div>

      <!-- TECH & LANGUAGES: DEVICES, OS, BROWSERS, LANGUAGES, SCREENS -->
      <div class="wx-grid-3">
        <section class="wx-panel">
          <div class="wx-panel-head">
            <h3><i class="fas fa-laptop-mobile" style="color:#a78bfa;"></i> Dispositivi & Sistemi Operativi</h3>
          </div>
          ${renderProgressRows(
            [
              { label: '💻 Computer (Desktop)', count: Number(s.devices?.desktop || 0), color: '#38bdf8' },
              { label: '📱 Smartphone (Mobile)', count: Number(s.devices?.mobile || 0), color: '#f472b6' },
              { label: '📟 Tablet', count: Number(s.devices?.tablet || 0), color: '#fbbf24' }
            ],
            totalDev
          )}
          <div style="font-size:0.75rem; font-weight:800; color:#94a3b8; text-transform:uppercase; margin:12px 0 8px; border-top:1px solid rgba(255,255,255,0.08); padding-top:10px;">Sistemi Operativi</div>
          ${renderProgressRows(
            sortedOS.map(([osName, , n]) => ({ label: esc(osName), count: n, color: '#a78bfa' })),
            totalViews,
            'Nessun dato OS.'
          )}
        </section>

        <section class="wx-panel">
          <div class="wx-panel-head">
            <h3><i class="fas fa-window-maximize" style="color:#38bdf8;"></i> Browser & Risoluzioni Schermo</h3>
          </div>
          ${renderProgressRows(
            sortedBrowsers.map(([br, , n]) => ({ label: esc(br), count: n, color: '#38bdf8' })),
            totalViews,
            'Nessun dato browser.'
          )}
          <div style="font-size:0.75rem; font-weight:800; color:#94a3b8; text-transform:uppercase; margin:12px 0 8px; border-top:1px solid rgba(255,255,255,0.08); padding-top:10px;">Risoluzioni Schermo Top</div>
          ${renderProgressRows(
            sortedScreens.slice(0, 6).map(([res, , n]) => ({ label: `🖥️ ${esc(res)}`, count: n, color: '#64748b' })),
            totalViews,
            'Nessuna risoluzione rilevata.'
          )}
        </section>

        <section class="wx-panel">
          <div class="wx-panel-head">
            <h3><i class="fas fa-language" style="color:#34d399;"></i> Lingue Visitatori</h3>
            <span class="wx-badge">Sito & Browser</span>
          </div>
          ${renderProgressRows(
            sortedLangs.map(([code, , n]) => ({
              label: LANG_NAMES[code] || `🌐 ${code.toUpperCase()}`,
              count: n,
              color: '#34d399'
            })),
            totalViews,
            'Nessuna lingua registrata.'
          )}
          <div style="font-size:0.75rem; font-weight:800; color:#94a3b8; text-transform:uppercase; margin:12px 0 8px; border-top:1px solid rgba(255,255,255,0.08); padding-top:10px;">Locale Browser (Dettaglio)</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${sortedBrowserLangs.length ? sortedBrowserLangs.map(([bl, , n]) => `
              <span style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); padding:3px 9px; border-radius:999px; font-size:0.74rem; color:#cbd5e1;">
                <strong>${esc(bl)}</strong>: ${n} (${pct(n, totalViews)}%)
              </span>
            `).join('') : '<span style="color:#64748b; font-size:0.8rem;">Nessun locale registrato.</span>'}
          </div>
        </section>
      </div>

      <!-- LIVE RECENT VISITS FEED TABLE -->
      <section class="wx-panel" style="margin-top:1.4rem;">
        <div class="wx-panel-head" style="flex-wrap:wrap; gap:10px;">
          <h3><i class="fas fa-stream" style="color:#38bdf8;"></i> Registro Live Ultime Visite (${filteredVisits.length} / ${(s.recentVisits || []).length})</h3>
          <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
            <input type="text" id="wx-log-search" value="${esc(logSearch)}" placeholder="Cerca paese, pagina, browser..." class="wx-search-input">
            <div class="wx-seg-group">
              <button type="button" class="wx-seg-btn ${logFilter === 'all' ? 'active' : ''}" data-logfilter="all">Tutti</button>
              <button type="button" class="wx-seg-btn ${logFilter === 'humans' ? 'active' : ''}" data-logfilter="humans">Umani</button>
              <button type="button" class="wx-seg-btn ${logFilter === 'bots' ? 'active' : ''}" data-logfilter="bots">Bot</button>
              <button type="button" class="wx-seg-btn ${logFilter === 'mobile' ? 'active' : ''}" data-logfilter="mobile">Mobile</button>
              <button type="button" class="wx-seg-btn ${logFilter === 'desktop' ? 'active' : ''}" data-logfilter="desktop">PC</button>
            </div>
          </div>
        </div>

        <div class="wx-table-wrap">
          <table class="wx-table">
            <thead>
              <tr>
                <th>Data / Ora</th>
                <th>Paese & Città</th>
                <th>Tipo</th>
                <th>Dispositivo & Tech</th>
                <th>Pagina Visitata</th>
                <th>Permanenza</th>
                <th>Lingua</th>
                <th>Provenienza</th>
              </tr>
            </thead>
            <tbody>
              ${filteredVisits.length ? filteredVisits.map((v) => {
                const cMeta = getCountryMeta(v.country);
                const devIcon = v.device === 'mobile' ? 'fa-mobile-screen' : v.device === 'tablet' ? 'fa-tablet-screen-button' : 'fa-desktop';
                const typeBadge = v.isBot
                  ? `<span class="wx-pill bot"><i class="fas fa-robot"></i> Bot${v.botCategory ? ' (' + esc(v.botCategory) + ')' : ''}</span>`
                  : v.humanVerified
                    ? `<span class="wx-pill human"><i class="fas fa-user-check"></i> Umano ✓</span>`
                    : `<span class="wx-pill human-soft"><i class="fas fa-user"></i> Umano</span>`;
                return `
                  <tr>
                    <td style="white-space:nowrap; color:#94a3b8;">${new Date(v.ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                    <td><strong>${cMeta.flag} ${esc(cMeta.name)}</strong><div style="font-size:0.72rem; color:#94a3b8;">${esc(v.city || '')}</div></td>
                    <td>${typeBadge}${v.isReturning ? '<div style="font-size:0.68rem; color:#38bdf8; margin-top:2px;">Di ritorno</div>' : '<div style="font-size:0.68rem; color:#64748b; margin-top:2px;">Nuovo</div>'}</td>
                    <td>
                      <i class="fas ${devIcon}" style="color:#c084fc;"></i> <strong>${esc(v.device)}</strong>
                      <div style="font-size:0.72rem; color:#94a3b8;">${esc(v.os)} • ${esc(v.browser)}</div>
                    </td>
                    <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(v.path)}">
                      <a href="${esc(v.path)}" target="_blank" style="color:#38bdf8; text-decoration:none; font-weight:700;">${esc(v.path)}</a>
                      <div style="font-size:0.7rem; color:#94a3b8;">${esc(v.category)}</div>
                    </td>
                    <td style="white-space:nowrap; font-weight:800; color:#fbbf24;">${formatDuration(v.durationSec)}</td>
                    <td style="text-transform:uppercase; font-weight:700;">${esc(v.lang)}<div style="font-size:0.68rem; color:#94a3b8; text-transform:none;">${esc(v.browserLang || '')}</div></td>
                    <td>
                      <span style="font-weight:700; color:#f8fafc;">${esc(v.sourceDetail || v.source)}</span>
                      <div style="font-size:0.7rem; color:#94a3b8;">${esc(v.source)}</div>
                    </td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="8" style="text-align:center; padding:2rem; color:#64748b;">
                    Nessuna visita trovata con i filtri selezionati.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </section>
    `;

    // Wire interactive buttons
    root.querySelectorAll('[data-days]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedDays = Number(btn.getAttribute('data-days')) || 14;
        render();
      });
    });

    root.querySelectorAll('[data-logfilter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        logFilter = btn.getAttribute('data-logfilter') || 'all';
        render();
      });
    });

    const searchInput = document.getElementById('wx-log-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        logSearch = e.target.value;
        const pos = searchInput.selectionStart;
        render();
        const nextInput = document.getElementById('wx-log-search');
        if (nextInput) {
          nextInput.focus();
          try { nextInput.setSelectionRange(pos, pos); } catch (err) {}
        }
      });
    }

    const refreshBtn = document.getElementById('wx-btn-refresh');
    if (refreshBtn) refreshBtn.onclick = () => refreshFromCloud(true);

    const autoBtn = document.getElementById('wx-btn-autorefresh');
    if (autoBtn) {
      autoBtn.onclick = () => {
        autoRefreshOn = !autoRefreshOn;
        if (autoRefreshTimer) {
          clearInterval(autoRefreshTimer);
          autoRefreshTimer = null;
        }
        if (autoRefreshOn) {
          autoRefreshTimer = setInterval(() => refreshFromCloud(false), 30000);
          if (window.showToast) window.showToast('Auto-aggiornamento ogni 30 secondi attivato!', 'info');
        }
        render();
      };
    }

    const csvBtn = document.getElementById('wx-btn-csv');
    if (csvBtn) csvBtn.onclick = () => {
      exportCSV();
      if (window.showToast) window.showToast('Report Woxlytics (.CSV) scaricato!', 'success');
    };

    const jsonBtn = document.getElementById('wx-btn-json');
    if (jsonBtn) jsonBtn.onclick = () => {
      exportJSON();
      if (window.showToast) window.showToast('Snapshot Woxlytics (.JSON) scaricato!', 'success');
    };

    const resetBtn = document.getElementById('wx-btn-reset');
    if (resetBtn) {
      resetBtn.onclick = async () => {
        const ok = window.confirm('Sei sicuro di voler azzerare TUTTE le statistiche di Woxlytics sul Cloud? Questa azione non è reversibile.');
        if (!ok) return;
        currentStats = await resetWoxlyticsData();
        render();
        if (window.showToast) window.showToast('Statistiche Woxlytics azzerate con successo.', 'info');
      };
    }
    const lockBtn = document.getElementById('wx-btn-lock');
    if (lockBtn) {
      lockBtn.onclick = () => {
        if (autoRefreshTimer) {
          clearInterval(autoRefreshTimer);
          autoRefreshTimer = null;
          autoRefreshOn = false;
        }
        sessionStorage.removeItem(WOX_UNLOCK_KEY);
        sessionStorage.removeItem('indieplay_backend_unlocked_v1');
        sessionStorage.removeItem('indieplay_mag_unlocked_v1');
        renderAuthGate();
        if (window.showToast) window.showToast('Sessione Woxlytics bloccata con successo.', 'info');
      };
    }
  };

  // Initial render (auth gate or dashboard if already unlocked from /bitmeme)
  if (isWoxlyticsSessionUnlocked()) {
    render();
    refreshFromCloud(false);
  } else {
    renderAuthGate();
  }
}
