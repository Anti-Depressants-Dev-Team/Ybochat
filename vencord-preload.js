// Vencord loader — injected before Discord loads.
// Fetches the latest bundle and appends it as the first <script>.
const https = require('node:https');

function get(url) {
  return new Promise(r => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400) return https.get(res.headers.location, r2 => {
        let d = ''; r2.on('data', c => d += c); r2.on('end', () => r(d));
      }).on('error', () => r(''));
      let d = ''; res.on('data', c => d += c); res.on('end', () => r(d));
    }).on('error', () => r(''));
  });
}

(async () => {
  const code = await get('https://cdn.jsdelivr.net/gh/Vencord/builds@main/vencordWeb.js');
  if (!code) return;

  const el = document.createElement('script');
  el.textContent = code;
  // Inject as soon as <head> appears (preload runs before DOM is ready)
  new MutationObserver((_, obs) => {
    if (document.head) { obs.disconnect(); document.head.appendChild(el); }
  }).observe(document, { childList: true, subtree: true });
})();
