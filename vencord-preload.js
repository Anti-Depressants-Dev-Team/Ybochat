// Vencord preload — runs before Discord loads in a dedicated BrowserWindow.
// Fetches the latest Vencord bundle via Node.js https and injects it.
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

  // Poll until document.head exists (preload runs very early)
  function inject() {
    if (document.head) {
      const el = document.createElement('script');
      el.textContent = code;
      document.head.appendChild(el);
    } else {
      setTimeout(inject, 1);
    }
  }
  inject();
})();
