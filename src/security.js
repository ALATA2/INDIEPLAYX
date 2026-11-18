// IndiePlay-X Ultra-Light Security Module (Steam-grade speed, zero dependencies)

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/**
 * Escapes untrusted strings to prevent XSS injection while keeping zero runtime overhead.
 */
export function escapeHTML(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

/**
 * Validates and sanitizes URLs (blocks javascript:, data:text/html, vbscript:).
 */
export function safeUrl(url, fallback = '') {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (/^(javascript|vbscript|data:text\/html)/i.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}

/**
 * Computes SHA-256 hex digest using browser-native Web Crypto API (crypto.subtle).
 */
export async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text || ''));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Client-side anti-bruteforce rate limiter with temporary lockout in sessionStorage.
 */
export function checkRateLimit(scopeKey, maxAttempts = 5, lockDurationMs = 60000) {
  const storageKey = `ipx_rl_${scopeKey}`;
  const now = Date.now();
  let record = { count: 0, lockUntil: 0 };

  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) record = JSON.parse(raw);
  } catch (e) {
    // ignore storage errors
  }

  if (record.lockUntil && now < record.lockUntil) {
    const remainingSec = Math.ceil((record.lockUntil - now) / 1000);
    return { allowed: false, remainingSec };
  }

  if (record.lockUntil && now >= record.lockUntil) {
    record = { count: 0, lockUntil: 0 };
  }

  record.count += 1;
  if (record.count > maxAttempts) {
    record.lockUntil = now + lockDurationMs;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(record));
    } catch (e) {}
    return { allowed: false, remainingSec: Math.ceil(lockDurationMs / 1000) };
  }

  try {
    sessionStorage.setItem(storageKey, JSON.stringify(record));
  } catch (e) {}
  return { allowed: true, remainingSec: 0 };
}

export function resetRateLimit(scopeKey) {
  try {
    sessionStorage.removeItem(`ipx_rl_${scopeKey}`);
  } catch (e) {}
}
