// Versionamento centrale di INDIE PLAY X
// Incrementare ad ogni aggiornamento
export const APP_VERSION = 'Version 1.11276';

export function renderVersionBadge() {
  let badge = document.getElementById('indieplay-version-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'indieplay-version-badge';
    badge.className = 'indieplay-version-badge';
    document.body.appendChild(badge);
  }
  badge.textContent = APP_VERSION;

  const footerVer = document.getElementById('footer-version-label');
  if (footerVer) {
    footerVer.textContent = APP_VERSION;
  }
}
