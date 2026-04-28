// Cache-bust + auto-reload watchdog.
// Same as loader.js, plus a 2s poll on the card file's Last-Modified header.
// When the file changes (after rsync), the dashboard reloads itself.
// Polling pauses when the tab is hidden so it's idle in the background.
const CARD_URL = new URL('./camera-gallery-card.js', import.meta.url).href;
const v = Date.now();
import(`./camera-gallery-card.js?v=${v}`);

const POLL_MS = 2000;
let lastSeen = null;

async function check() {
  if (document.visibilityState !== 'visible') return;
  try {
    // HA's frontend doesn't allow HEAD on /local/*, so use GET with no-cache.
    // The browser sends If-Modified-Since automatically; HA returns 304 (no
    // body) when unchanged, 200 (with body) only when the file actually moved.
    const r = await fetch(CARD_URL, { cache: 'no-cache' });
    const m = r.headers.get('last-modified');
    if (!m) return;
    if (lastSeen === null) {
      lastSeen = m;
    } else if (m !== lastSeen) {
      console.info('[Camera Gallery Card] file changed, reloading dashboard');
      location.reload();
    }
  } catch {
    /* ignore — try again next tick */
  }
}

setInterval(check, POLL_MS);
