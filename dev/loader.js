// Dev-only cache-busting wrapper.
// Registered as a Lovelace resource at /local/dev/loader.js so the URL the
// browser requests is stable, but the import inside is unique per page load
// and bypasses both the HTTP cache and HA's service worker.
const v = Date.now();
import(`./camera-gallery-card.js?v=${v}`);
