// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { injectLiveFillStyle } from "./live-fill-style";

function mkHostWithShadow(): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  host.attachShadow({ mode: "open" });
  return host;
}

describe("injectLiveFillStyle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("injects #cgc-fill into the card's shadow root", () => {
    const host = mkHostWithShadow();
    injectLiveFillStyle(host);
    expect(host.shadowRoot!.querySelector("#cgc-fill")).toBeTruthy();
  });

  it("is idempotent on the same shadow root", () => {
    const host = mkHostWithShadow();
    injectLiveFillStyle(host);
    injectLiveFillStyle(host);
    expect(host.shadowRoot!.querySelectorAll("#cgc-fill").length).toBe(1);
  });

  it("walks one level of nested shadow roots", () => {
    const host = mkHostWithShadow();
    const inner = document.createElement("div");
    host.shadowRoot!.appendChild(inner);
    inner.attachShadow({ mode: "open" });
    injectLiveFillStyle(host);
    expect(inner.shadowRoot!.querySelector("#cgc-fill")).toBeTruthy();
  });

  it("walks two levels of nested shadow roots", () => {
    const host = mkHostWithShadow();
    const mid = document.createElement("div");
    host.shadowRoot!.appendChild(mid);
    mid.attachShadow({ mode: "open" });
    const deep = document.createElement("div");
    mid.shadowRoot!.appendChild(deep);
    deep.attachShadow({ mode: "open" });
    injectLiveFillStyle(host);
    expect(deep.shadowRoot!.querySelector("#cgc-fill")).toBeTruthy();
  });

  it("neutralizes padding-bottom on .ratio descendants with !important", () => {
    const host = mkHostWithShadow();
    const ratio = document.createElement("div");
    ratio.className = "ratio";
    ratio.style.paddingBottom = "56.25%";
    host.shadowRoot!.appendChild(ratio);
    injectLiveFillStyle(host);
    // jsdom normalizes bare `0` to `0px` for length properties.
    expect(ratio.style.getPropertyValue("padding-bottom")).toMatch(/^0(px)?$/);
    expect(ratio.style.getPropertyPriority("padding-bottom")).toBe("important");
  });

  it("re-walks after the reinject delay for lazy-mounted inner shadow roots", () => {
    const host = mkHostWithShadow();
    injectLiveFillStyle(host);

    // Mount an inner shadow root AFTER the initial walk.
    const inner = document.createElement("div");
    host.shadowRoot!.appendChild(inner);
    inner.attachShadow({ mode: "open" });
    expect(inner.shadowRoot!.querySelector("#cgc-fill")).toBeFalsy();

    vi.advanceTimersByTime(2_000);
    expect(inner.shadowRoot!.querySelector("#cgc-fill")).toBeTruthy();
  });

  it("inserts CSS that includes the fill rules", () => {
    const host = mkHostWithShadow();
    injectLiveFillStyle(host);
    const css = host.shadowRoot!.querySelector("#cgc-fill")?.textContent ?? "";
    expect(css).toContain("object-fit:cover!important");
    expect(css).toContain("ha-hls-player");
    expect(css).toContain("ha-web-rtc-player");
    expect(css).toContain("ha-camera-stream");
  });

  it("does nothing when the card has no shadow root and no children mount", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    // No shadowRoot, ever.
    injectLiveFillStyle(host);
    // Drain any pending timers — should not throw.
    vi.advanceTimersByTime(10_000);
    expect(host.shadowRoot).toBeNull();
  });
});
