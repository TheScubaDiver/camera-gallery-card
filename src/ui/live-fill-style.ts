/**
 * Force a live-stream child card to fill its host element.
 *
 * `<hui-image>`, `<ha-camera-stream>`, `<ha-hls-player>` and AlexxIT's
 * `<ha-web-rtc-player>` all default to letterboxed sizing; the camera-gallery
 * live-view embeds these inside a fixed-aspect host and needs them to fill
 * 100% width/height with `object-fit: cover` instead. We can't override their
 * inner CSS from outside their shadow trees, so we inject a `<style>` element
 * with `!important` rules into each shadow root we find.
 *
 * Walks the card's shadow tree plus every nested shadow root encountered
 * (each player ships its own). Idempotent: a style tag with the same id is
 * skipped. Re-walks after 2s for lazy-mounted inner elements (hui-image's
 * picture child can appear after the parent's initial paint); if no shadow
 * root exists at call time, falls back to a MutationObserver for 5s.
 */

const LIVE_FILL_STYLE_ID = "cgc-fill";

/** Re-injection delay for lazy-rendered inner shadow roots. */
const LIVE_FILL_REINJECT_DELAY_MS = 2_000;

/** MutationObserver fallback timeout when no shadow root exists at call time. */
const LIVE_FILL_MO_TIMEOUT_MS = 5_000;

const LIVE_FILL_CSS = `
  :host { display:block!important; width:100%!important; height:100%!important; }
  .image-container { width:100%!important; height:100%!important; }
  .ratio { padding-bottom:0!important; padding-top:0!important; width:100%!important; height:100%!important; position:relative!important; }
  img, video, ha-hls-player, ha-web-rtc-player, ha-camera-stream { width:100%!important; height:100%!important; object-fit:cover!important; display:block!important; position:static!important; }
`;

function injectInto(el: Element): void {
  const sr = el.shadowRoot;
  if (!sr || sr.querySelector(`#${LIVE_FILL_STYLE_ID}`)) return;
  const s = document.createElement("style");
  s.id = LIVE_FILL_STYLE_ID;
  s.textContent = LIVE_FILL_CSS;
  sr.appendChild(s);
  // Neutralize hui-image's padding-bottom aspect-ratio hack so the inner
  // <img> can grow to the host's full height.
  const ratio = sr.querySelector<HTMLElement>(".ratio");
  if (ratio) ratio.style.setProperty("padding-bottom", "0", "important");
}

function injectDeep(root: ParentNode): void {
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot) {
      injectInto(el);
      injectDeep(el.shadowRoot);
    }
  }
}

export function injectLiveFillStyle(card: Element): void {
  injectInto(card);

  const tryInject = (): boolean => {
    const sr = card.shadowRoot;
    if (!sr) return false;
    injectDeep(sr);
    return true;
  };

  if (!tryInject()) {
    const obs = new MutationObserver(() => {
      if (tryInject()) obs.disconnect();
    });
    obs.observe(card.shadowRoot ?? card, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), LIVE_FILL_MO_TIMEOUT_MS);
  }

  // Re-walk after a short delay; some hui-image children mount after the
  // parent's first paint.
  setTimeout(() => {
    if (card.shadowRoot) injectDeep(card.shadowRoot);
  }, LIVE_FILL_REINJECT_DELAY_MS);
}
