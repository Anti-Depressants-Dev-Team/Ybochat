// Vencord loader — injected as webview preload with nodeintegration enabled.
// Runs before Discord's scripts, fetches Vencord via Node.js (bypasses CSP),
// and injects it into the page.

const https = require('node:https');

function fetchCode(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (r2) => {
          let d = '';
          r2.on('data', c => d += c);
          r2.on('end', () => resolve(d));
        }).on('error', () => resolve(null));
        return;
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(null));
  });
}

(async () => {
  const url = 'https://cdn.jsdelivr.net/gh/Vencord/builds@main/vencordWeb.js';
  const code = await fetchCode(url);
  if (!code) return;

  // Inject as the first script in the page — runs before Discord's own scripts
  const el = document.createElement('script');
  el.textContent = code;
  // documentElement always exists at preload time
  document.documentElement.appendChild(el);
  // The script element won't execute because it's appended to <html>, not <head>.
  // But document.write at this stage still works for synchronous injection:
  document.write('<script>' + code + '</' + 'script>');
})();
