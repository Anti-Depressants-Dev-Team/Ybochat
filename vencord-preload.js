// Vencord preload — runs in webview with nodeintegration.
// Fetches the latest Vencord bundle via Node.js https and injects it
// as a <script> before Discord's own scripts execute.
const https = require('node:https');

function fetch(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return https.get(res.headers.location, (r2) => {
          let d = '';
          r2.on('data', c => d += c);
          r2.on('end', () => resolve(d));
        }).on('error', () => resolve(''));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

(async () => {
  const code = await fetch('https://cdn.jsdelivr.net/gh/Vencord/builds@main/vencordWeb.js');
  if (!code) return;

  // Inject into the page before Discord loads.
  // At preload time the document exists but head may not.
  // Use a polling approach to inject as early as possible.
  const el = document.createElement('script');
  el.textContent = code;

  function tryInject() {
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(el);
      return true;
    }
    return false;
  }

  if (!tryInject()) {
    // Retry on DOM mutations
    const obs = new MutationObserver(() => {
      if (tryInject()) obs.disconnect();
    });
    obs.observe(document, { childList: true, subtree: true });
  }
})();
