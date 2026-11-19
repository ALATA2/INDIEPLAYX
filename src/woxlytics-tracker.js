import { db } from './firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const WOXLYTICS_DOC_REF_PATH = ['settings', 'woxlytics_v1'];
export const WOXLYTICS_LOCAL_KEY = 'indieplay_woxlytics_v1';

const VISITOR_ID_KEY = 'woxlytics_vid_v1';
const SESSION_KEY = 'woxlytics_sess_v1';
const GEO_CACHE_KEY = 'woxlytics_geo_v1';

// Country metadata (ISO-2 -> Italian Name + Flag)
export const COUNTRY_META = {
  IT: { name: 'Italia', flag: '🇮🇹' },
  US: { name: 'Stati Uniti', flag: '🇺🇸' },
  ES: { name: 'Spagna', flag: '🇪🇸' },
  FR: { name: 'Francia', flag: '🇫🇷' },
  DE: { name: 'Germania', flag: '🇩🇪' },
  GB: { name: 'Regno Unito', flag: '🇬🇧' },
  BR: { name: 'Brasile', flag: '🇧🇷' },
  CA: { name: 'Canada', flag: '🇨🇦' },
  AU: { name: 'Australia', flag: '🇦🇺' },
  JP: { name: 'Giappone', flag: '🇯🇵' },
  CH: { name: 'Svizzera', flag: '🇨🇭' },
  NL: { name: 'Paesi Bassi', flag: '🇳🇱' },
  PT: { name: 'Portogallo', flag: '🇵🇹' },
  PL: { name: 'Polonia', flag: '🇵🇱' },
  BE: { name: 'Belgio', flag: '🇧🇪' },
  AT: { name: 'Austria', flag: '🇦🇹' },
  SE: { name: 'Svezia', flag: '🇸🇪' },
  NO: { name: 'Norvegia', flag: '🇳🇴' },
  DK: { name: 'Danimarca', flag: '🇩🇰' },
  FI: { name: 'Finlandia', flag: '🇫🇮' },
  IE: { name: 'Irlanda', flag: '🇮🇪' },
  MX: { name: 'Messico', flag: '🇲🇽' },
  AR: { name: 'Argentina', flag: '🇦🇷' },
  CO: { name: 'Colombia', flag: '🇨🇴' },
  CL: { name: 'Cile', flag: '🇨🇱' },
  IN: { name: 'India', flag: '🇮🇳' },
  KR: { name: 'Corea del Sud', flag: '🇰🇷' },
  CN: { name: 'Cina', flag: '🇨🇳' },
  RU: { name: 'Russia', flag: '🇷🇺' },
  UA: { name: 'Ucraina', flag: '🇺🇦' },
  TR: { name: 'Turchia', flag: '🇹🇷' },
  RO: { name: 'Romania', flag: '🇷🇴' },
  GR: { name: 'Grecia', flag: '🇬🇷' },
  CZ: { name: 'Repubblica Ceca', flag: '🇨🇿' },
  HU: { name: 'Ungheria', flag: '🇭🇺' },
  SG: { name: 'Singapore', flag: '🇸🇬' },
  NZ: { name: 'Nuova Zelanda', flag: '🇳🇿' },
  ZA: { name: 'Sudafrica', flag: '🇿🇦' },
  AE: { name: 'Emirati Arabi', flag: '🇦🇪' },
  SA: { name: 'Arabia Saudita', flag: '🇸🇦' },
  XX: { name: 'Sconosciuto', flag: '🌍' }
};

export function getCountryMeta(code) {
  const cc = String(code || 'XX').toUpperCase().slice(0, 2);
  return COUNTRY_META[cc] || { name: cc, flag: '🌐' };
}

// Timezone -> Country fallback mapping (when IP lookup is blocked by adblockers)
const TIMEZONE_TO_COUNTRY = {
  'Europe/Rome': ['IT', 'Italia (Fuso Orario)'],
  'Europe/Madrid': ['ES', 'Spagna (Fuso Orario)'],
  'Atlantic/Canary': ['ES', 'Canarie'],
  'Europe/Paris': ['FR', 'Francia (Fuso Orario)'],
  'Europe/Berlin': ['DE', 'Germania (Fuso Orario)'],
  'Europe/London': ['GB', 'Regno Unito (Fuso Orario)'],
  'Europe/Zurich': ['CH', 'Svizzera (Fuso Orario)'],
  'Europe/Amsterdam': ['NL', 'Paesi Bassi (Fuso Orario)'],
  'Europe/Lisbon': ['PT', 'Portogallo (Fuso Orario)'],
  'Europe/Warsaw': ['PL', 'Polonia (Fuso Orario)'],
  'Europe/Brussels': ['BE', 'Belgio (Fuso Orario)'],
  'Europe/Vienna': ['AT', 'Austria (Fuso Orario)'],
  'Europe/Stockholm': ['SE', 'Svezia (Fuso Orario)'],
  'Europe/Oslo': ['NO', 'Norvegia (Fuso Orario)'],
  'Europe/Copenhagen': ['DK', 'Danimarca (Fuso Orario)'],
  'Europe/Helsinki': ['FI', 'Finlandia (Fuso Orario)'],
  'Europe/Dublin': ['IE', 'Irlanda (Fuso Orario)'],
  'Europe/Bucharest': ['RO', 'Romania (Fuso Orario)'],
  'Europe/Athens': ['GR', 'Grecia (Fuso Orario)'],
  'Europe/Prague': ['CZ', 'Rep. Ceca (Fuso Orario)'],
  'Europe/Budapest': ['HU', 'Ungheria (Fuso Orario)'],
  'Europe/Istanbul': ['TR', 'Turchia (Fuso Orario)'],
  'Europe/Kyiv': ['UA', 'Ucraina (Fuso Orario)'],
  'Europe/Moscow': ['RU', 'Russia (Fuso Orario)'],
  'America/New_York': ['US', 'USA East'],
  'America/Chicago': ['US', 'USA Central'],
  'America/Denver': ['US', 'USA Mountain'],
  'America/Los_Angeles': ['US', 'USA West'],
  'America/Phoenix': ['US', 'USA Arizona'],
  'America/Toronto': ['CA', 'Canada East'],
  'America/Vancouver': ['CA', 'Canada West'],
  'America/Sao_Paulo': ['BR', 'Brasile'],
  'America/Mexico_City': ['MX', 'Messico'],
  'America/Argentina/Buenos_Aires': ['AR', 'Argentina'],
  'America/Bogota': ['CO', 'Colombia'],
  'America/Santiago': ['CL', 'Cile'],
  'Asia/Tokyo': ['JP', 'Giappone'],
  'Asia/Seoul': ['KR', 'Corea del Sud'],
  'Asia/Shanghai': ['CN', 'Cina'],
  'Asia/Kolkata': ['IN', 'India'],
  'Asia/Singapore': ['SG', 'Singapore'],
  'Asia/Dubai': ['AE', 'Emirati Arabi'],
  'Australia/Sydney': ['AU', 'Australia'],
  'Australia/Melbourne': ['AU', 'Australia'],
  'Pacific/Auckland': ['NZ', 'Nuova Zelanda']
};

export function createEmptyWoxlyticsState() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    lastVisitAt: null,
    totals: {
      views: 0,
      uniqueSessions: 0,
      uniqueVisitors: 0,
      newVisitors: 0,
      returningVisitors: 0,
      humanViews: 0,
      humanVerifiedViews: 0,
      botViews: 0,
      totalDurationSec: 0,
      durationSamples: 0,
      bounces: 0
    },
    dailyHistory: {},       // { 'YYYY-MM-DD': { views, uniques, humans, bots, durationSec, durationSamples } }
    hourlyDistribution: {}, // { '00': 0, ..., '23': 0 }
    pages: {
      home: { views: 0, durationSec: 0, samples: 0 },
      game: { views: 0, durationSec: 0, samples: 0 },
      showcase: { views: 0, durationSec: 0, samples: 0 },
      account: { views: 0, durationSec: 0, samples: 0 },
      other: { views: 0, durationSec: 0, samples: 0 }
    },
    topPaths: {},           // { '/game.html?id=...': { views, title, category, durationSec } }
    countries: {},          // { IT: 12, US: 5, ... }
    cities: {},             // { 'Milano (IT)': 4, ... }
    devices: {
      desktop: 0,
      mobile: 0,
      tablet: 0
    },
    os: {},                 // { Windows: 10, Android: 5, ... }
    browsers: {},           // { Chrome: 12, Safari: 4, ... }
    screens: {},            // { '1920x1080': 8, ... }
    languages: {},          // { it: 15, en: 6, ... }
    browserLanguages: {},   // { 'it-IT': 12, 'en-US': 4, ... }
    sources: {
      direct: 0,
      social: 0,
      search: 0,
      referral: 0,
      campaign: 0
    },
    socialPlatforms: {},    // { Instagram: 4, YouTube: 3, ... }
    searchEngines: {},      // { Google: 8, Bing: 2, ... }
    referrers: {},          // { 'reddit.com': 3, ... }
    botTypes: {},           // { 'Search Crawler': 2, 'AI Bot': 1, 'Headless / Script': 1, 'Social Preview': 1 }
    durationBuckets: {
      lt10: 0,      // < 10s
      s10_30: 0,    // 10s - 30s
      s30_60: 0,    // 30s - 1m
      m1_3: 0,      // 1m - 3m
      m3_10: 0,     // 3m - 10m
      gt10m: 0      // > 10m
    },
    recentVisits: []        // capped at latest 60 visits
  };
}

export function normalizeWoxlyticsState(raw) {
  const base = createEmptyWoxlyticsState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    totals: { ...base.totals, ...(raw.totals || {}) },
    dailyHistory: { ...(raw.dailyHistory || {}) },
    hourlyDistribution: { ...(raw.hourlyDistribution || {}) },
    pages: {
      home: { ...base.pages.home, ...(raw.pages?.home || {}) },
      game: { ...base.pages.game, ...(raw.pages?.game || {}) },
      showcase: { ...base.pages.showcase, ...(raw.pages?.showcase || {}) },
      account: { ...base.pages.account, ...(raw.pages?.account || {}) },
      other: { ...base.pages.other, ...(raw.pages?.other || {}) }
    },
    topPaths: { ...(raw.topPaths || {}) },
    countries: { ...(raw.countries || {}) },
    cities: { ...(raw.cities || {}) },
    devices: { ...base.devices, ...(raw.devices || {}) },
    os: { ...(raw.os || {}) },
    browsers: { ...(raw.browsers || {}) },
    screens: { ...(raw.screens || {}) },
    languages: { ...(raw.languages || {}) },
    browserLanguages: { ...(raw.browserLanguages || {}) },
    sources: { ...base.sources, ...(raw.sources || {}) },
    socialPlatforms: { ...(raw.socialPlatforms || {}) },
    searchEngines: { ...(raw.searchEngines || {}) },
    referrers: { ...(raw.referrers || {}) },
    botTypes: { ...(raw.botTypes || {}) },
    durationBuckets: { ...base.durationBuckets, ...(raw.durationBuckets || {}) },
    recentVisits: Array.isArray(raw.recentVisits) ? raw.recentVisits.slice(0, 60) : []
  };
}

export function loadWoxlyticsLocal() {
  try {
    const raw = localStorage.getItem(WOXLYTICS_LOCAL_KEY);
    if (raw) return normalizeWoxlyticsState(JSON.parse(raw));
  } catch (e) {}
  return createEmptyWoxlyticsState();
}

export async function fetchWoxlyticsFromCloud() {
  try {
    const snap = await getDoc(doc(db, ...WOXLYTICS_DOC_REF_PATH));
    if (snap.exists()) {
      const normalized = normalizeWoxlyticsState(snap.data());
      try {
        localStorage.setItem(WOXLYTICS_LOCAL_KEY, JSON.stringify(normalized));
      } catch (e) {}
      return normalized;
    }
  } catch (e) {}
  return loadWoxlyticsLocal();
}

export async function isWoxlyticsEnabledInCloud() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'payment_config'));
    if (snap.exists()) {
      const data = snap.data();
      if (data && data.woxlyticsEnabled === false) return false;
      return true;
    }
  } catch (e) {}
  try {
    const raw = localStorage.getItem('indieplay_payment_config_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.woxlyticsEnabled === false) return false;
    }
  } catch (e) {}
  return true;
}

export async function resetWoxlyticsData() {
  const fresh = createEmptyWoxlyticsState();
  try {
    localStorage.setItem(WOXLYTICS_LOCAL_KEY, JSON.stringify(fresh));
  } catch (e) {}
  await setDoc(doc(db, ...WOXLYTICS_DOC_REF_PATH), fresh);
  return fresh;
}

// ============================================================================
// CLIENT TELEMETRY DETECTORS (BOT, DEVICE, OS, BROWSER, SOURCE, GEO)
// ============================================================================
function detectBotInfo() {
  const ua = (navigator.userAgent || '').toLowerCase();

  const searchBots = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|sogou|exabot|applebot|petalbot|seznambot/;
  const aiBots = /gptbot|chatgpt-user|oai-searchbot|claudebot|anthropic-ai|perplexitybot|bytespider|ccbot|cohere-ai|amazonbot|meta-externalagent/;
  const socialBots = /facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|slackbot|pinterest|redditbot/;
  const seoOrMonitorBots = /semrushbot|ahrefsbot|mj12bot|dotbot|screaming frog|lighthouse|gtmetrix|pagespeed|pingdom|uptimerobot|statuscake|site24x7/;
  const headlessBots = /headlesschrome|phantomjs|puppeteer|playwright|selenium|python-requests|python-urllib|curl\/|wget\/|httpclient|scrapy|go-http-client|node-fetch|axios/;

  if (searchBots.test(ua)) return { isBot: true, botCategory: 'Search Crawler' };
  if (aiBots.test(ua)) return { isBot: true, botCategory: 'AI Bot / LLM' };
  if (socialBots.test(ua)) return { isBot: true, botCategory: 'Social Preview Bot' };
  if (seoOrMonitorBots.test(ua)) return { isBot: true, botCategory: 'SEO / Audit Bot' };
  if (headlessBots.test(ua)) return { isBot: true, botCategory: 'Headless / Script' };

  if (navigator.webdriver === true) {
    return { isBot: true, botCategory: 'Automation (WebDriver)' };
  }

  // Additional headless anomalies
  const noLangs = !navigator.languages || navigator.languages.length === 0;
  const zeroViewport = window.outerWidth === 0 && window.outerHeight === 0;
  if (noLangs && zeroViewport) {
    return { isBot: true, botCategory: 'Headless / Anomalia' };
  }

  return { isBot: false, botCategory: null };
}

function detectDeviceType() {
  const ua = navigator.userAgent || '';
  const isTablet = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  if (isTablet) return 'tablet';
  const isMobile = /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|Opera Mini/i.test(ua) || window.innerWidth <= 768;
  if (isMobile) return 'mobile';
  return 'desktop';
}

function detectOS() {
  const ua = navigator.userAgent || '';
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Altro';
}

function detectBrowser() {
  const ua = navigator.userAgent || '';
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Brave/i.test(ua) || (navigator.brave && typeof navigator.brave.isBrave === 'function')) return 'Brave';
  if (/Chrome\/|CriOS/i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua)) return 'Safari';
  return 'Altro';
}

function detectTrafficSource() {
  const params = new URLSearchParams(window.location.search || '');
  const utmSource = (params.get('utm_source') || '').trim();
  const utmMedium = (params.get('utm_medium') || '').trim();
  const utmCampaign = (params.get('utm_campaign') || '').trim();

  if (utmSource) {
    return {
      channel: 'campaign',
      detail: `${utmSource}${utmMedium ? ' / ' + utmMedium : ''}${utmCampaign ? ' (' + utmCampaign + ')' : ''}`,
      socialPlatform: null,
      searchEngine: null,
      referrerHost: utmSource
    };
  }

  const ref = (document.referrer || '').trim();
  if (!ref) {
    return { channel: 'direct', detail: 'Traffico Diretto', socialPlatform: null, searchEngine: null, referrerHost: null };
  }

  let host = '';
  try {
    host = new URL(ref).hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return { channel: 'direct', detail: 'Traffico Diretto', socialPlatform: null, searchEngine: null, referrerHost: null };
  }

  const currentHost = (window.location.hostname || '').toLowerCase().replace(/^www\./, '');
  if (!host || host === currentHost) {
    return { channel: 'direct', detail: 'Navigazione Interna / Diretta', socialPlatform: null, searchEngine: null, referrerHost: null };
  }

  // Social Media detection
  const socialMap = [
    [/instagram\.com|l\.instagram\.com/, 'Instagram'],
    [/tiktok\.com/, 'TikTok'],
    [/facebook\.com|fb\.com|m\.facebook\.com|l\.facebook\.com/, 'Facebook'],
    [/twitter\.com|x\.com|t\.co/, 'X / Twitter'],
    [/youtube\.com|youtu\.be/, 'YouTube'],
    [/reddit\.com|old\.reddit\.com/, 'Reddit'],
    [/discord\.com|discord\.gg/, 'Discord'],
    [/linkedin\.com|lnkd\.in/, 'LinkedIn'],
    [/t\.me|telegram\.org/, 'Telegram'],
    [/whatsapp\.com|wa\.me/, 'WhatsApp'],
    [/twitch\.tv/, 'Twitch'],
    [/pinterest\./, 'Pinterest'],
    [/threads\.net/, 'Threads']
  ];
  for (const [regex, name] of socialMap) {
    if (regex.test(host)) {
      return { channel: 'social', detail: name, socialPlatform: name, searchEngine: null, referrerHost: host };
    }
  }

  // Search Engines & AI Search
  const searchMap = [
    [/google\./, 'Google'],
    [/bing\.com/, 'Bing'],
    [/duckduckgo\.com/, 'DuckDuckGo'],
    [/yahoo\./, 'Yahoo'],
    [/yandex\./, 'Yandex'],
    [/ecosia\.org/, 'Ecosia'],
    [/search\.brave\.com/, 'Brave Search'],
    [/chatgpt\.com|openai\.com/, 'ChatGPT / AI'],
    [/perplexity\.ai/, 'Perplexity AI']
  ];
  for (const [regex, name] of searchMap) {
    if (regex.test(host)) {
      return { channel: 'search', detail: name, socialPlatform: null, searchEngine: name, referrerHost: host };
    }
  }

  return { channel: 'referral', detail: host, socialPlatform: null, searchEngine: null, referrerHost: host };
}

function detectPageInfo() {
  const pathname = (window.location.pathname || '/').toLowerCase();
  const search = window.location.search || '';
  let category = 'home';
  if (pathname.includes('game')) category = 'game';
  else if (pathname.includes('showcase')) category = 'showcase';
  else if (pathname.includes('account')) category = 'account';
  else if (pathname !== '/' && !pathname.endsWith('index.html')) category = 'other';

  // Build clean display path (truncate very long queries)
  let cleanPath = pathname === '/index.html' ? '/' : pathname;
  if (search) {
    const params = new URLSearchParams(search);
    const keyParam = params.get('id') || params.get('dev') || params.get('slug') || '';
    if (keyParam) {
      const k = params.has('id') ? 'id' : params.has('dev') ? 'dev' : 'slug';
      cleanPath += `?${k}=${keyParam.slice(0, 40)}`;
    }
  }

  return {
    category,
    path: cleanPath,
    title: (document.title || cleanPath).slice(0, 70)
  };
}

function fallbackGeoFromTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (TIMEZONE_TO_COUNTRY[tz]) {
      return {
        countryCode: TIMEZONE_TO_COUNTRY[tz][0],
        city: TIMEZONE_TO_COUNTRY[tz][1],
        source: 'timezone'
      };
    }
    const navLang = (navigator.language || '').toUpperCase();
    const parts = navLang.split('-');
    if (parts.length === 2 && COUNTRY_META[parts[1]]) {
      return { countryCode: parts[1], city: `${COUNTRY_META[parts[1]].name} (Locale)`, source: 'locale' };
    }
  } catch (e) {}
  return { countryCode: 'XX', city: 'Sconosciuta', source: 'fallback' };
}

async function detectGeoLocation() {
  try {
    const cached = sessionStorage.getItem(GEO_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.countryCode) return parsed;
    }
  } catch (e) {}

  // Try ipwho.is (HTTPS, CORS-friendly, free, no API key)
  const tryFetch = async (url, timeoutMs = 2400) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      clearTimeout(t);
      return null;
    }
  };

  let geo = null;
  const data1 = await tryFetch('https://ipwho.is/');
  if (data1 && data1.success !== false && data1.country_code) {
    geo = {
      countryCode: String(data1.country_code).toUpperCase().slice(0, 2),
      city: data1.city || data1.region || getCountryMeta(data1.country_code).name,
      source: 'ip'
    };
  }

  if (!geo) {
    const data2 = await tryFetch('https://ipapi.co/json/');
    if (data2 && data2.country_code) {
      geo = {
        countryCode: String(data2.country_code).toUpperCase().slice(0, 2),
        city: data2.city || data2.region || getCountryMeta(data2.country_code).name,
        source: 'ip'
      };
    }
  }

  if (!geo) {
    geo = fallbackGeoFromTimezone();
  }

  try {
    sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geo));
  } catch (e) {}
  return geo;
}

function getDurationBucketKey(sec) {
  if (sec < 10) return 'lt10';
  if (sec < 30) return 's10_30';
  if (sec < 60) return 's30_60';
  if (sec < 180) return 'm1_3';
  if (sec < 600) return 'm3_10';
  return 'gt10m';
}

function trimTopMap(mapObj, maxKeys = 40) {
  const entries = Object.entries(mapObj || {});
  if (entries.length <= maxKeys) return mapObj;
  entries.sort((a, b) => {
    const va = typeof a[1] === 'object' ? (a[1].views || 0) : Number(a[1] || 0);
    const vb = typeof b[1] === 'object' ? (b[1].views || 0) : Number(b[1] || 0);
    return vb - va;
  });
  return Object.fromEntries(entries.slice(0, maxKeys));
}

// ============================================================================
// MAIN TRACKER INITIALIZER (CALLED ON EVERY PUBLIC PAGE)
// ============================================================================
let trackerInitialized = false;

export function initWoxlyticsTracker(getSiteLanguageFn = null) {
  if (typeof window === 'undefined' || trackerInitialized) return;
  const pathLower = (window.location.pathname || '').toLowerCase();

  // Escludi le pagine amministrative/analitiche interne
  if (
    pathLower.includes('bitmeme') ||
    pathLower.includes('woxlytics') ||
    document.getElementById('bitmeme-hub-root') ||
    document.getElementById('woxlytics-app-root')
  ) {
    return;
  }

  trackerInitialized = true;

  const visitId = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  const botInfo = detectBotInfo();
  const device = detectDeviceType();
  const os = detectOS();
  const browser = detectBrowser();
  const screenRes = `${window.screen?.width || 0}x${window.screen?.height || 0}`;
  const sourceInfo = detectTrafficSource();
  const pageInfo = detectPageInfo();
  const browserLang = (navigator.language || 'en').trim();
  const siteLang = (
    (typeof getSiteLanguageFn === 'function' ? getSiteLanguageFn() : null) ||
    localStorage.getItem('indieplay_lang') ||
    document.documentElement.lang ||
    browserLang.slice(0, 2) ||
    'en'
  ).toLowerCase().slice(0, 2);

  // Visitor & Session tracking
  let isReturning = false;
  let isNewSession = false;
  let sessionPages = 1;
  try {
    if (localStorage.getItem(VISITOR_ID_KEY)) {
      isReturning = true;
    } else {
      localStorage.setItem(VISITOR_ID_KEY, 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    }

    const sessRaw = sessionStorage.getItem(SESSION_KEY);
    if (!sessRaw) {
      isNewSession = true;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ startedAt: Date.now(), pages: 1 }));
    } else {
      const sObj = JSON.parse(sessRaw);
      sessionPages = (Number(sObj.pages) || 0) + 1;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...sObj, pages: sessionPages }));
    }
  } catch (e) {}

  // Behavioral human verification (mouse, touch, scroll, keydown)
  let humanVerified = false;
  const markHuman = () => {
    if (humanVerified || botInfo.isBot) return;
    humanVerified = true;
    ['pointermove', 'scroll', 'touchstart', 'keydown', 'click'].forEach((evt) => {
      window.removeEventListener(evt, markHuman, { passive: true });
    });
  };
  if (!botInfo.isBot) {
    ['pointermove', 'scroll', 'touchstart', 'keydown', 'click'].forEach((evt) => {
      window.addEventListener(evt, markHuman, { passive: true });
    });
  }

  // Active Dwell Time tracking (pauses when tab is hidden)
  let visibleStartMs = document.visibilityState === 'hidden' ? null : Date.now();
  let accumulatedVisibleMs = 0;
  let lastFlushedSec = 0;
  let lastBucketKey = null;
  let initialRecorded = false;
  let bounceCounted = false;
  let humanVerifiedRecorded = false;

  const getCurrentActiveSeconds = () => {
    let totalMs = accumulatedVisibleMs;
    if (visibleStartMs !== null) {
      totalMs += Math.max(0, Date.now() - visibleStartMs);
    }
    // Cap a single page session at 2 hours (7200s) to avoid abandoned-tab skew
    return Math.min(7200, Math.round(totalMs / 1000));
  };

  const todayKey = new Date().toISOString().slice(0, 10);
  const hourKey = String(new Date().getHours()).padStart(2, '0');

  // 1. Initial Pageview Recording (after 1.1s to let Geo & quick human gestures settle)
  setTimeout(async () => {
    try {
      const enabled = await isWoxlyticsEnabledInCloud();
      if (!enabled) return;
      const geo = await detectGeoLocation();
      const state = await fetchWoxlyticsFromCloud();

      // Totals
      state.totals.views += 1;
      if (isNewSession) {
        state.totals.uniqueSessions += 1;
        if (isReturning) {
          state.totals.returningVisitors += 1;
        } else {
          state.totals.newVisitors += 1;
          state.totals.uniqueVisitors += 1;
        }
      }

      if (botInfo.isBot) {
        state.totals.botViews += 1;
        const bCat = botInfo.botCategory || 'Altro Bot';
        state.botTypes[bCat] = (Number(state.botTypes[bCat]) || 0) + 1;
      } else {
        state.totals.humanViews += 1;
        if (humanVerified) {
          state.totals.humanVerifiedViews += 1;
          humanVerifiedRecorded = true;
        }
      }

      // Assume bounce initially if first page of session; will be reverted when user stays >= 15s or visits page 2
      if (isNewSession && !botInfo.isBot) {
        state.totals.bounces += 1;
        bounceCounted = true;
      } else if (sessionPages === 2 && !botInfo.isBot && state.totals.bounces > 0) {
        // User navigated to a 2nd page in the same session -> not a bounce!
        state.totals.bounces = Math.max(0, state.totals.bounces - 1);
      }

      // Daily history (keep last 90 days)
      if (!state.dailyHistory[todayKey]) {
        state.dailyHistory[todayKey] = { views: 0, uniques: 0, humans: 0, bots: 0, durationSec: 0, durationSamples: 0 };
      }
      state.dailyHistory[todayKey].views += 1;
      if (isNewSession) state.dailyHistory[todayKey].uniques += 1;
      if (botInfo.isBot) state.dailyHistory[todayKey].bots += 1;
      else state.dailyHistory[todayKey].humans += 1;

      const sortedDays = Object.keys(state.dailyHistory).sort();
      if (sortedDays.length > 90) {
        sortedDays.slice(0, sortedDays.length - 90).forEach((oldDay) => delete state.dailyHistory[oldDay]);
      }

      // Hourly distribution
      state.hourlyDistribution[hourKey] = (Number(state.hourlyDistribution[hourKey]) || 0) + 1;

      // Page category & Top Paths
      if (!state.pages[pageInfo.category]) {
        state.pages[pageInfo.category] = { views: 0, durationSec: 0, samples: 0 };
      }
      state.pages[pageInfo.category].views += 1;

      if (!state.topPaths[pageInfo.path]) {
        state.topPaths[pageInfo.path] = { views: 0, title: pageInfo.title, category: pageInfo.category, durationSec: 0 };
      }
      state.topPaths[pageInfo.path].views += 1;
      state.topPaths[pageInfo.path].title = pageInfo.title;
      state.topPaths = trimTopMap(state.topPaths, 40);

      // Geography
      const cc = geo.countryCode || 'XX';
      state.countries[cc] = (Number(state.countries[cc]) || 0) + 1;
      const cityLabel = `${geo.city || getCountryMeta(cc).name} (${cc})`;
      state.cities[cityLabel] = (Number(state.cities[cityLabel]) || 0) + 1;
      state.cities = trimTopMap(state.cities, 35);

      // Device, OS, Browser, Screen
      state.devices[device] = (Number(state.devices[device]) || 0) + 1;
      state.os[os] = (Number(state.os[os]) || 0) + 1;
      state.browsers[browser] = (Number(state.browsers[browser]) || 0) + 1;
      if (screenRes !== '0x0') {
        state.screens[screenRes] = (Number(state.screens[screenRes]) || 0) + 1;
        state.screens = trimTopMap(state.screens, 18);
      }

      // Languages
      state.languages[siteLang] = (Number(state.languages[siteLang]) || 0) + 1;
      state.browserLanguages[browserLang] = (Number(state.browserLanguages[browserLang]) || 0) + 1;
      state.browserLanguages = trimTopMap(state.browserLanguages, 25);

      // Sources
      state.sources[sourceInfo.channel] = (Number(state.sources[sourceInfo.channel]) || 0) + 1;
      if (sourceInfo.socialPlatform) {
        state.socialPlatforms[sourceInfo.socialPlatform] = (Number(state.socialPlatforms[sourceInfo.socialPlatform]) || 0) + 1;
      }
      if (sourceInfo.searchEngine) {
        state.searchEngines[sourceInfo.searchEngine] = (Number(state.searchEngines[sourceInfo.searchEngine]) || 0) + 1;
      }
      if (sourceInfo.referrerHost && sourceInfo.channel === 'referral') {
        state.referrers[sourceInfo.referrerHost] = (Number(state.referrers[sourceInfo.referrerHost]) || 0) + 1;
        state.referrers = trimTopMap(state.referrers, 30);
      }

      // Initial duration sample (1s)
      const initSec = Math.max(1, getCurrentActiveSeconds());
      lastFlushedSec = initSec;
      lastBucketKey = getDurationBucketKey(initSec);
      state.totals.totalDurationSec += initSec;
      state.totals.durationSamples += 1;
      state.dailyHistory[todayKey].durationSec += initSec;
      state.dailyHistory[todayKey].durationSamples += 1;
      state.pages[pageInfo.category].durationSec += initSec;
      state.pages[pageInfo.category].samples += 1;
      state.topPaths[pageInfo.path].durationSec = (Number(state.topPaths[pageInfo.path].durationSec) || 0) + initSec;
      state.durationBuckets[lastBucketKey] = (Number(state.durationBuckets[lastBucketKey]) || 0) + 1;

      // Recent Visits Log (latest 60)
      const visitEntry = {
        id: visitId,
        ts: new Date().toISOString(),
        country: cc,
        city: geo.city || getCountryMeta(cc).name,
        isBot: botInfo.isBot,
        botCategory: botInfo.botCategory,
        humanVerified,
        device,
        os,
        browser,
        screen: screenRes,
        lang: siteLang,
        browserLang,
        source: sourceInfo.channel,
        sourceDetail: sourceInfo.detail,
        category: pageInfo.category,
        path: pageInfo.path,
        title: pageInfo.title,
        durationSec: initSec,
        isReturning
      };
      state.recentVisits = [visitEntry, ...(state.recentVisits || [])].slice(0, 60);
      state.lastVisitAt = visitEntry.ts;

      initialRecorded = true;
      localStorage.setItem(WOXLYTICS_LOCAL_KEY, JSON.stringify(state));
      await setDoc(doc(db, ...WOXLYTICS_DOC_REF_PATH), state, { merge: true });
    } catch (e) {}
  }, 1100);

  // 2. Dwell Time & Human Verification Flush
  let isFlushing = false;
  const flushDwellTime = async () => {
    if (!initialRecorded || isFlushing) return;
    const currentSec = getCurrentActiveSeconds();
    const delta = currentSec - lastFlushedSec;
    const needsHumanUpdate = humanVerified && !humanVerifiedRecorded && !botInfo.isBot;

    if (delta < 3 && !needsHumanUpdate) return;
    isFlushing = true;

    try {
      const state = await fetchWoxlyticsFromCloud();

      if (delta > 0) {
        state.totals.totalDurationSec = (Number(state.totals.totalDurationSec) || 0) + delta;
        if (state.dailyHistory[todayKey]) {
          state.dailyHistory[todayKey].durationSec = (Number(state.dailyHistory[todayKey].durationSec) || 0) + delta;
        }
        if (state.pages[pageInfo.category]) {
          state.pages[pageInfo.category].durationSec = (Number(state.pages[pageInfo.category].durationSec) || 0) + delta;
        }
        if (state.topPaths[pageInfo.path]) {
          state.topPaths[pageInfo.path].durationSec = (Number(state.topPaths[pageInfo.path].durationSec) || 0) + delta;
        }

        // Move duration bucket if user crossed into a higher bracket
        const newBucket = getDurationBucketKey(currentSec);
        if (lastBucketKey && newBucket !== lastBucketKey) {
          state.durationBuckets[lastBucketKey] = Math.max(0, (Number(state.durationBuckets[lastBucketKey]) || 0) - 1);
          state.durationBuckets[newBucket] = (Number(state.durationBuckets[newBucket]) || 0) + 1;
          lastBucketKey = newBucket;
        }

        // If user stayed >= 15 seconds, remove from bounce count
        if (bounceCounted && currentSec >= 15) {
          state.totals.bounces = Math.max(0, (Number(state.totals.bounces) || 0) - 1);
          bounceCounted = false;
        }

        lastFlushedSec = currentSec;
      }

      if (needsHumanUpdate) {
        state.totals.humanVerifiedViews = (Number(state.totals.humanVerifiedViews) || 0) + 1;
        humanVerifiedRecorded = true;
      }

      // Update the matching entry in recentVisits
      if (Array.isArray(state.recentVisits)) {
        const idx = state.recentVisits.findIndex((v) => v.id === visitId);
        if (idx !== -1) {
          state.recentVisits[idx].durationSec = currentSec;
          if (humanVerified) state.recentVisits[idx].humanVerified = true;
        }
      }

      localStorage.setItem(WOXLYTICS_LOCAL_KEY, JSON.stringify(state));
      await setDoc(doc(db, ...WOXLYTICS_DOC_REF_PATH), state, { merge: true });
    } catch (e) {
    } finally {
      isFlushing = false;
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (visibleStartMs !== null) {
        accumulatedVisibleMs += Math.max(0, Date.now() - visibleStartMs);
        visibleStartMs = null;
      }
      flushDwellTime();
    } else {
      visibleStartMs = Date.now();
    }
  });

  window.addEventListener('pagehide', () => {
    if (visibleStartMs !== null) {
      accumulatedVisibleMs += Math.max(0, Date.now() - visibleStartMs);
      visibleStartMs = null;
    }
    flushDwellTime();
  });

  // Periodic heartbeats to guarantee dwell-time capture even if tab crashes
  setTimeout(() => flushDwellTime(), 15000);
  setTimeout(() => flushDwellTime(), 45000);
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      flushDwellTime();
    }
  }, 60000);
}
