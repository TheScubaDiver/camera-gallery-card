/**
 * Card stylesheet for `<camera-gallery-card>`.
 *
 * Extracted from the legacy `static get styles()` block in `src/index.js`.
 * The numeric `:host` defaults for radius controls (`--cgc-card-radius`,
 * `--cgc-thumb-radius`, etc.) are injected up-front from `STYLE_SECTIONS`
 * via `genStyleSectionDefaults()` so the editor's radius sliders and the
 * runtime CSS share one source of truth.
 *
 * Audit fixes applied during extraction:
 *   - A1: `--r` → `--cgc-card-radius` (was outside the `--cgc-*` namespace).
 *   - A3: deduped `--cgc-pill-bg` in `:host` (kept the hard-coded `#000`
 *         since that's what every install renders today).
 *   - A13: dropped dead `position: relative;` in `.live-picker`
 *          (overridden by `position: absolute;` on the next line).
 */

import { css, unsafeCSS } from "lit";

import { genStyleSectionDefaults } from "./config/styling-config";

const sectionDefaults = unsafeCSS(genStyleSectionDefaults());

export const cardStyles = css`
  /*
      * ──────────────────────────────────────────────────────────────
      * Theme tokens
      * ──────────────────────────────────────────────────────────────
      */
  :host {
    display: block;
    ${sectionDefaults}

    /* ── text ── */
        --cgc-txt:          var(--primary-text-color,   rgba(0,0,0,0.87));
    --cgc-txt2: var(--secondary-text-color, rgba(0, 0, 0, 0.6));
    --cgc-txt-dis: var(--disabled-text-color, rgba(0, 0, 0, 0.38));

    /* ── surfaces ── */
    --cgc-card-bg: var(--card-background-color, #fff);
    --cgc-preview-bg: var(--card-background-color, #fff);

    /* ── controls / chrome ── */
    --cgc-ui-bg: var(--secondary-background-color, rgba(0, 0, 0, 0.08));
    --cgc-ui-stroke: var(--divider-color, rgba(0, 0, 0, 0.12));
    --cgc-divider: var(--divider-color, rgba(0, 0, 0, 0.1));
    --cgc-thumb-bg: var(--secondary-background-color, rgba(0, 0, 0, 0.06));
    --cgc-tbar-bg: var(--secondary-background-color, rgba(0, 0, 0, 0.16));

    /* ── nav overlay buttons ── */
    --cgc-nav-bg: rgba(0, 0, 0, 0.18);
    --cgc-nav-border: rgba(0, 0, 0, 0.18);

    /* ── selection overlay ── */
    --cgc-sel-ov-a: rgba(0, 0, 0, 0.1);
    --cgc-sel-ov-b: rgba(0, 0, 0, 0.22);

    /* ── bulk bar ── */
    --cgc-bulk-bg: var(--secondary-background-color, rgba(0, 0, 0, 0.06));
    --cgc-bulk-border: var(--divider-color, rgba(0, 0, 0, 0.1));

    --cgc-ts-r: 0;
    --cgc-ts-g: 0;
    --cgc-ts-b: 0;
    --cgc-tsbar-txt: #fff;
    --cgc-pill-bg: #000;
  }

  @media (prefers-color-scheme: dark) {
    :host {
      --cgc-nav-bg: rgba(0, 0, 0, 0.45);
      --cgc-nav-border: rgba(255, 255, 255, 0.18);
      --cgc-sel-ov-a: rgba(0, 0, 0, 0.18);
      --cgc-sel-ov-b: rgba(0, 0, 0, 0.32);
    }
  }

  :host-context(.dark-mode) {
    --cgc-nav-bg: rgba(0, 0, 0, 0.45);
    --cgc-nav-border: rgba(255, 255, 255, 0.18);
    --cgc-sel-ov-a: rgba(0, 0, 0, 0.18);
    --cgc-sel-ov-b: rgba(0, 0, 0, 0.32);
  }

  /* ──────────────────────────────────────────────────────────── */

  .root {
    display: block;
    background: transparent;
    border-radius: 0;
    min-height: 0;
    padding: 0;
    position: relative;
  }

  :host([data-live-fs]) {
    position: fixed !important;
    inset: 0 !important;
    z-index: 9999 !important;
    width: 100vw !important;
    height: 100vh !important;

    & .root {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #000;
    }
    & .panel {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      border-radius: 0 !important;
    }
    & .preview {
      flex: 1 !important;
      height: auto !important;
      min-height: 0;
      border-radius: 0 !important;
      overflow: hidden;
    }
    & :is(.divider, .objfilters, .tthumbs, .datepill, .seg) {
      display: none !important;
    }
  }

  .panel {
    background: var(--cgc-card-bg, var(--card-background-color, #fff));
    border: 1px solid var(--cgc-card-border-color, var(--divider-color, rgba(0, 0, 0, 0.12)));
    border-radius: var(--cgc-card-radius);
    box-sizing: border-box;
    padding: var(--cardPad, 4px 4px);
    display: flex;
    flex-direction: column;
    gap: var(--cgc-row-gap, 8px);
  }
  .divider {
    display: none;
  }

  .preview {
    position: relative;
    -webkit-mask-image: -webkit-radial-gradient(white, black);
    background: var(--cgc-preview-bg);
    border-radius: var(--cgc-card-radius);
    overflow: hidden;
    transform: translateZ(0);
    width: 100%;
  }

  .pimg {
    display: block;
    height: 100%;
    object-fit: var(--cgc-object-fit, cover);
    width: 100%;
    pointer-events: none;
  }

  .img-fs-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100dvw;
    height: 100dvh;
  }
  .img-fs-overlay img,
  .img-fs-overlay video {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .img-fs-close {
    position: absolute;
    top: 12px;
    right: 12px;
    background: rgba(0, 0, 0, 0.5);
    border: none;
    border-radius: 50%;
    color: #fff;
    cursor: pointer;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .live-stage {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .live-offline {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .live-offline-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: grayscale(100%) opacity(0.35);
  }
  .live-offline-badge {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    color: rgba(255, 255, 255, 0.75);
    font-size: 13px;
    font-weight: 600;
  }
  .live-offline-badge ha-icon {
    --ha-icon-size: 36px;
    --mdc-icon-size: 36px;
    width: 36px;
    height: 36px;
  }
  .live-offline-state {
    font-size: 11px;
    font-weight: 400;
    opacity: 0.6;
  }

  .live-card-host {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background: transparent;
    border-radius: inherit;
    overflow: hidden;

    & > * {
      width: 100% !important;
      height: 100% !important;
      display: block !important;
    }
    & ha-card {
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      box-shadow: none !important;
      background: transparent !important;
      border-radius: 0 !important;
      overflow: hidden !important;
    }
    & video {
      width: 100% !important;
      height: 100% !important;
      object-fit: var(--cgc-object-fit, cover) !important;
    }
    /* Multi-camera grid layout (live_layout: grid). Disable pinch-zoom and
     * double-tap-zoom on the grid surface via touch-action. */
    &.live-grid-host {
      display: grid !important;
      grid-template-columns: repeat(var(--cgc-grid-cols, 2), 1fr);
      grid-template-rows: repeat(var(--cgc-grid-rows, 2), 1fr);
      gap: 4px;
      padding: 0;
      background: #000;
      touch-action: manipulation;
    }
  }

  .live-host-hidden {
    display: none !important;
  }

  .live-grid-tile {
    position: relative;
    background: #000;
    overflow: hidden;
    cursor: pointer;
    border-radius: 4px;
    touch-action: manipulation;
  }

  .live-grid-tile > ha-camera-stream {
    width: 100% !important;
    height: 100% !important;
    display: block !important;
    object-fit: cover !important;
  }

  .live-grid-host.live-grid-no-labels .live-grid-label {
    display: none;
  }

  .live-grid-label {
    position: absolute;
    bottom: 6px;
    left: 6px;
    background: rgba(0, 0, 0, 0.4);
    color: #fff;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    line-height: 1.4;
    pointer-events: none;
    max-width: calc(100% - 12px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .segbtn.livebtn {
    width: 60px;
  }

  .segbtn.livebtn.on {
    background: var(--cgc-live-active-bg, var(--error-color, #c62828));
    color: var(--text-primary-color, #fff);
  }

  .preview-video-host {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .preview-video-host > video {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: var(--cgc-object-fit, cover);
    pointer-events: auto;
  }

  @keyframes livePulse {
    0% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.55);
    }
    70% {
      transform: scale(1);
      box-shadow: 0 0 0 8px rgba(255, 255, 255, 0);
    }
    100% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
    }
  }

  .live-picker-backdrop {
    position: absolute;
    inset: 0;
    z-index: 23;
    background: rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }

  /* ─── Diagnostics modal ─── */
  .cgc-debug-backdrop {
    position: absolute;
    inset: 0;
    z-index: 30;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  .cgc-debug-modal {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(94%, 540px);
    max-height: min(88%, 680px);
    z-index: 31;
    background: var(--card-background-color, #16191e);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    box-shadow: 0 24px 56px rgba(0, 0, 0, 0.55);
    color: var(--primary-text-color, #e6edf3);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
  }
  .cgc-debug-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 14px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .cgc-debug-head-title {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .cgc-debug-head-title ha-icon {
    --mdc-icon-size: 22px;
    color: #f0883e;
  }
  .cgc-debug-close {
    background: transparent;
    border: 0;
    color: inherit;
    cursor: pointer;
    padding: 6px;
    border-radius: 8px;
    opacity: 0.7;
    display: inline-flex;

    &:hover {
      background: rgba(255, 255, 255, 0.08);
      opacity: 1;
    }
  }
  .cgc-debug-body {
    overflow-y: auto;
    padding: 8px 20px 16px;
  }
  .cgc-debug-section {
    margin-top: 18px;

    &:first-child {
      margin-top: 8px;
    }
  }
  .cgc-debug-section-head {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--primary-text-color);

    & ha-icon {
      --mdc-icon-size: 16px;
      opacity: 0.65;
    }
  }
  .cgc-debug-rows {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    overflow: hidden;
  }
  .cgc-debug-row {
    display: grid;
    grid-template-columns: minmax(0, 0.55fr) minmax(0, 1fr);
    gap: 14px;
    padding: 9px 14px;
    font-size: 13px;
    line-height: 1.4;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);

    &:last-child {
      border-bottom: 0;
    }
  }
  .cgc-debug-key {
    opacity: 0.62;
    font-weight: 500;
    word-break: break-word;
  }
  .cgc-debug-val {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace;
    font-size: 12.5px;
    word-break: break-all;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cgc-debug-val-text {
    flex: 1;
    min-width: 0;
    word-break: break-all;
  }
  .cgc-debug-dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #768390;
  }
  .cgc-debug-foot {
    padding: 12px 20px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .cgc-debug-copy {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 11px 14px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 120ms ease,
      border-color 120ms ease;

    &:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.16);
    }
    &.copied {
      background: rgba(45, 164, 78, 0.15);
      border-color: rgba(45, 164, 78, 0.45);
      color: #56d364;
    }
    & ha-icon {
      --mdc-icon-size: 16px;
    }
  }

  .live-picker {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(78%, 360px);
    max-height: min(80%, 500px);
    overflow: hidden;
    border-radius: 18px;
    z-index: 24;
    background: var(--card-background-color, rgba(24, 24, 28, 0.94));
    border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.34);
    color: var(--primary-text-color);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);

    &::before {
      content: "";
      position: absolute;
      inset: 0;
      background: var(--cgc-pill-bg);
      opacity: calc(var(--cgc-bar-opacity, 30) / 100);
      backdrop-filter: blur(4px);
      z-index: 0;
      pointer-events: none;
      border-radius: inherit;
    }
    & .live-picker-head,
    & .live-picker-list {
      position: relative;
      z-index: 1;
    }
    & .live-picker-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 18px;
      border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
    }
    & .live-picker-title {
      font-size: 16px;
      font-weight: 900;
      color: var(--primary-text-color);
    }
    & .live-picker-close {
      width: 36px;
      height: 36px;
      border-radius: 999px;
      border: 0;
      background: var(--cgc-ui-bg);
      color: var(--primary-text-color);
      display: grid;
      place-items: center;
      cursor: pointer;
      padding: 0;

      & ha-icon {
        --ha-icon-size: 18px;
        --mdc-icon-size: var(--ha-icon-size);
        width: var(--ha-icon-size);
        height: var(--ha-icon-size);
      }
    }
    & .live-picker-list {
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
    }
    & .live-picker-item {
      width: 100%;
      border: 0;
      background: transparent;
      color: var(--primary-text-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 16px 18px;
      cursor: pointer;
      text-align: left;
      border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.05));

      &:first-child {
        border-top: 0;
      }
      &:hover {
        background: var(--cgc-ui-bg);
      }
      &.on {
        background: rgba(var(--rgb-primary-color, 33, 150, 243), 0.16);
      }
    }
    & .live-picker-item-left {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      flex: 1 1 auto;

      & ha-icon {
        --ha-icon-size: 20px;
        --mdc-icon-size: var(--ha-icon-size);
        width: var(--ha-icon-size);
        height: var(--ha-icon-size);
        color: var(--primary-color, #4da3ff);
        flex: 0 0 auto;
      }
    }
    & .live-picker-item-name {
      display: flex;
      flex-direction: column;
      min-width: 0;

      & span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        &:first-child {
          font-size: 15px;
          font-weight: 800;
        }
      }
    }
    & .live-picker-item-entity {
      font-size: 11px;
      font-weight: 500;
      opacity: 0.55;
    }
    & .live-picker-check {
      --ha-icon-size: 22px;
      --mdc-icon-size: var(--ha-icon-size);
      width: var(--ha-icon-size);
      height: var(--ha-icon-size);
      color: var(--primary-color, #4da3ff);
      flex: 0 0 auto;
    }
  }

  .tthumbs-wrap {
    width: calc(100% + 8px);
    box-sizing: border-box;
    margin-top: 0;
    margin-left: -4px;
    margin-right: -4px;

    &.horizontal {
      min-height: var(--cgc-thumb-row-h, 86px);
    }
    &.vertical {
      min-height: var(--cgc-thumbs-max-h, 320px);
    }
    &.empty.horizontal {
      height: var(--cgc-thumb-empty-h, 86px);
      min-height: var(--cgc-thumb-empty-h, 86px);
      max-height: var(--cgc-thumb-empty-h, 86px);
      display: flex;
      align-items: stretch;
      background: transparent;
    }
    &.empty.vertical {
      min-height: var(--cgc-thumbs-max-h, 320px);
      display: flex;
      align-items: stretch;
      background: transparent;
    }
  }

  .thumbs-empty-state {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0 16px;
    box-sizing: border-box;
    border-radius: 14px;
    background: transparent;
    color: var(--cgc-txt);
    font-size: 14px;
    font-weight: 700;
  }

  .preview-empty {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    box-sizing: border-box;
    color: var(--cgc-txt);
    font-size: 15px;
    font-weight: 700;
    background: var(--cgc-preview-bg);
  }

  .objfilters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
  }

  .objbtn {
    width: 100%;
    height: 28px;
    border: 0;
    border-radius: var(--cgc-obj-btn-radius, 10px);
    padding: 0;
    background: var(--cgc-obj-btn-bg, var(--cgc-ui-bg));
    color: var(--cgc-obj-icon-color, var(--cgc-txt));
    display: grid;
    place-items: center;
    cursor: pointer;

    &.on {
      background: var(--cgc-obj-btn-active-bg, var(--primary-color, #2196f3));
      color: var(--cgc-obj-icon-active-color, var(--text-primary-color, #fff));
    }
    & ha-icon {
      --ha-icon-size: 22px;
      --mdc-icon-size: var(--ha-icon-size);
      width: var(--ha-icon-size);
      height: var(--ha-icon-size);
    }
  }

  .pnav {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    pointer-events: none;
    z-index: 3;
  }

  .pnavbtn {
    pointer-events: auto;
    width: 44px;
    height: 44px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.18) 0%, rgba(0, 0, 0, 0.28) 100%);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
    color: #fff;
    display: grid;
    place-items: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    opacity: 0.9;
  }

  .pnavbtn[disabled] {
    opacity: 0;
    cursor: default;
  }

  .pnavbtn ha-icon {
    --ha-icon-size: 26px;
    --mdc-icon-size: var(--ha-icon-size);
    width: var(--ha-icon-size);
    height: var(--ha-icon-size);
  }

  .tsbar {
    position: absolute;
    left: 0;
    right: 0;
    height: 40px;
    padding: 0 10px 0 12px;
    background: rgba(
      var(--cgc-ts-r, 0),
      var(--cgc-ts-g, 0),
      var(--cgc-ts-b, 0),
      calc(var(--cgc-bar-opacity, 45) / 100)
    );
    color: var(--cgc-tsbar-txt, #fff);
    font-size: 12px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    box-sizing: border-box;
    pointer-events: none;
    z-index: 2;
    backdrop-filter: blur(calc(8px * min(1, var(--cgc-bar-opacity, 45))));
    -webkit-backdrop-filter: blur(calc(8px * min(1, var(--cgc-bar-opacity, 45))));
  }

  .tsbar.top {
    top: 0;
  }

  .tsbar.bottom {
    bottom: 0;
  }

  .live-controls-bar {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    bottom: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    opacity: 0;
    transition: opacity 0.25s ease;
    pointer-events: none;
    z-index: 10;
  }
  .live-controls-bar.visible {
    opacity: 1;
    pointer-events: auto;
  }
  .live-controls-bar:not(.visible) .live-pill-btn {
    pointer-events: none;
  }
  .live-controls-bar.bottom {
    top: auto;
    bottom: 8px;
  }
  .live-controls-bar.hidden {
    display: none;
  }
  .live-controls-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
  }
  .live-controls-main--fixed {
    justify-content: center;
  }
  .controls-bar-fixed {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    padding: 0;
    margin: 0;
    gap: 6px;
    position: relative;

    & :is(.live-controls-main--fixed, .live-pills-left, .live-pills-right) {
      display: contents;
    }
    & :is(.gallery-pill, .live-pill-btn) {
      flex: 1;
      height: calc(var(--cgc-pill-size, 14px) * 2);
      min-width: 0;
      background: var(--cgc-obj-btn-bg, var(--cgc-ui-bg));
      border-radius: var(--cgc-obj-btn-radius, 10px);
      color: var(--cgc-txt);
      padding: 0;
      font-size: var(--cgc-pill-size, 14px);
      font-weight: 600;
    }
    & .gallery-pill::before {
      display: none;
    }
    & .live-pill-btn.active {
      background: var(--primary-color, #2196f3);
      border-radius: var(--cgc-obj-btn-radius, 10px);
    }
    & .live-hamburger-wrap {
      flex: 1;
      display: flex;

      & > .gallery-pill {
        flex: 1;
        width: 100%;
      }
    }
  }
  .live-pills-left,
  .live-pills-right {
    display: flex;
    flex-direction: row;
    gap: 6px;
    align-items: center;
  }
  .live-hamburger-wrap {
    position: relative;
  }
  .live-menu-backdrop {
    position: absolute;
    inset: 0;
    z-index: 22;
  }
  .live-menu-panel {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) scale(0.88);
    opacity: 0;
    z-index: 23;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-radius: 16px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 160px;
    animation: cgc-panel-in 0.2s ease-out forwards;
  }
  @keyframes cgc-panel-in {
    to {
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
    }
  }
  .live-menu-panel-btn {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 7px 8px;
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.92);
    transition:
      background 0.15s ease,
      opacity 0.15s ease;
    -webkit-tap-highlight-color: transparent;
    width: 100%;
    text-align: left;
    opacity: 0.5;
  }
  .live-menu-panel-btn.active {
    opacity: 1;
  }
  .live-menu-panel-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    opacity: 1;
  }
  .panel-btn-icon {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.14);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    transition:
      background 0.15s ease,
      color 0.15s ease;
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.7);
  }
  .live-menu-panel-btn.active .panel-btn-icon {
    background: var(--primary-color, #2196f3);
    color: #fff;
  }
  .live-menu-panel-lbl {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.01em;
  }
  .gallery-pills {
    position: absolute;
    left: 8px;
    right: 8px;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    opacity: 0;
    transition: opacity 0.25s ease;
    pointer-events: none;
    z-index: 10;

    &.visible {
      opacity: 1;
      pointer-events: auto;
    }
    &:not(.visible) .live-pill-btn {
      pointer-events: none;
    }
    &.top {
      top: 8px;
    }
    &.bottom {
      bottom: 8px;
    }
  }
  .gallery-pills-left,
  .gallery-pills-right {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    flex: 1;
  }
  .gallery-pills-right {
    justify-content: flex-end;
  }
  .gallery-pills-center {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .gallery-pill {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: calc(var(--cgc-pill-size, 14px) * 0.28);
    padding: calc(var(--cgc-pill-size, 14px) * 0.3) calc(var(--cgc-pill-size, 14px) * 0.65);
    color: var(--cgc-tsbar-txt, #fff);
    font-size: var(--cgc-pill-size, 14px);
    font-weight: 700;
    border-radius: 999px;
    line-height: 1;
    position: relative;
    white-space: nowrap;

    &::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: var(--cgc-pill-bg);
      opacity: calc(var(--cgc-bar-opacity, 30) / 100);
      backdrop-filter: blur(4px);
      pointer-events: none;
    }
    & ha-icon,
    & span {
      position: relative;
      z-index: 1;
    }
    & span {
      display: flex;
      align-items: center;
      font-size: calc(var(--cgc-pill-size, 14px) - 2px);
      height: calc(var(--cgc-pill-size, 14px) + 2px);
      line-height: 1;
    }
    & ha-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      line-height: 0;
      --ha-icon-size: calc(var(--cgc-pill-size, 14px) + 2px);
      --mdc-icon-size: calc(var(--cgc-pill-size, 14px) + 2px);
      width: calc(var(--cgc-pill-size, 14px) + 2px);
      height: calc(var(--cgc-pill-size, 14px) + 2px);
    }
  }
  .live-pill-btn {
    pointer-events: auto;
    border: none;
    background: transparent;
    cursor: pointer;
    padding: calc(var(--cgc-pill-size, 14px) * 0.3);
    margin: 0;
  }

  .live-pill-btn.active {
    background: rgba(255, 80, 80, 0.85);
    border-radius: 50%;
  }

  /* ─── Two-way audio (mic) pill ─────────────────────────────────────── */
  .live-pill-btn.mic-pill {
    position: relative;
    border-radius: 50%;
  }
  /* Connecting: outline + spinner glyph. Disabled to prevent racing a
     second handshake while the first is still in flight. */
  .live-pill-btn.mic-connecting ha-icon {
    animation: cgc-mic-spin 1s linear infinite;
  }
  .live-pill-btn.mic-pill[disabled] {
    cursor: progress;
    opacity: 0.85;
  }
  /* Active: solid red background + slow pulse. The level ring scales
     opacity via --cgc-mic-level (0..1) so the ring intensity tracks input
     volume in real time. */
  .live-pill-btn.mic-active {
    background: var(--cgc-mic-active-bg, rgba(220, 38, 38, 0.88));
    color: #fff;
    animation: cgc-mic-pulse 1.6s ease-in-out infinite;
  }
  .live-pill-btn.mic-active .mic-level-ring {
    position: absolute;
    inset: -3px;
    border: 2px solid currentColor;
    border-radius: 50%;
    opacity: var(--cgc-mic-level, 0);
    transition: opacity 60ms linear;
    pointer-events: none;
  }
  .live-pill-btn .mic-level-ring {
    position: absolute;
    inset: -3px;
    border: 2px solid transparent;
    border-radius: 50%;
    pointer-events: none;
  }
  /* Error: red icon tint + outline so the pill stays visibly broken even
     after the toast auto-clears. Tints icon + adds a clear ring to
     distinguish from idle at a glance. */
  .live-pill-btn.mic-error {
    box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.85) inset;
    color: rgb(220, 38, 38);
  }
  .live-pill-btn.mic-error ha-icon {
    --mdc-icon-color: rgb(220, 38, 38);
    color: rgb(220, 38, 38);
  }

  /* Push-to-talk hint — small "HOLD" badge under the icon while idle so
     first-time users know to press and hold, not just tap. */
  .live-pill-btn.mic-pill {
    position: relative;
  }
  .live-pill-btn .mic-ptt-hint {
    position: absolute;
    left: 50%;
    bottom: -8px;
    transform: translateX(-50%);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.08em;
    line-height: 1;
    padding: 1px 4px;
    border-radius: 4px;
    background: var(--secondary-background-color, rgba(0, 0, 0, 0.55));
    color: var(--primary-text-color, #fff);
    pointer-events: none;
    white-space: nowrap;
  }
  .live-pill-btn.mic-active .mic-ptt-hint,
  .live-pill-btn.mic-connecting .mic-ptt-hint {
    display: none;
  }

  @keyframes cgc-mic-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.45);
    }
    50% {
      box-shadow: 0 0 0 9px rgba(220, 38, 38, 0);
    }
  }
  @keyframes cgc-mic-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Per A11y / reduced-motion: skip the pulse + level-ring animation. */
  @media (prefers-reduced-motion: reduce) {
    .live-pill-btn.mic-active,
    .live-pill-btn.mic-connecting ha-icon {
      animation: none;
    }
    .live-pill-btn .mic-level-ring {
      transition: none;
    }
  }

  /* Mic error toast — sits inside live-controls-bar so layout doesn't
     shift; role=status + aria-live=polite announces via screen readers. */
  .mic-error-toast {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    margin-top: 4px;
    border-radius: 10px;
    font-size: 12px;
    line-height: 1.3;
    color: #fff;
    background: rgba(220, 38, 38, 0.92);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    pointer-events: auto;
    max-width: 320px;
    opacity: 0;
    transform: translateY(-4px);
    transition:
      opacity 160ms ease,
      transform 160ms ease;
  }
  .mic-error-toast.visible {
    opacity: 1;
    transform: translateY(0);
  }
  .mic-error-toast:not(.visible) {
    visibility: hidden;
  }
  .mic-error-toast ha-icon {
    --mdc-icon-size: 16px;
    flex: 0 0 auto;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: var(--cgc-topbar-padding, 0px);
    margin: var(--cgc-topbar-margin, 0px);
    overflow: hidden;
    min-width: 0;
  }

  .seg {
    display: inline-flex;
    align-items: center;
    height: 30px;
    background: var(--cgc-ui-bg);
    border-radius: var(--cgc-ctrl-radius, 10px);
    overflow: hidden;
    flex: 0 0 auto;
  }

  .segbtn {
    border: 0;
    height: 100%;
    padding: 0 12px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--cgc-ctrl-txt, var(--cgc-txt2));
    background: transparent;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;

    &.on {
      background: var(--primary-color, #2196f3);
      color: var(--text-primary-color, #fff);
      border-radius: var(--cgc-ctrl-radius, 10px);
    }
  }

  .datepill {
    display: flex;
    align-items: center;
    height: 30px;
    background: var(--cgc-ui-bg);
    border-radius: var(--cgc-ctrl-radius, 10px);
    overflow: hidden;
    flex: 1 1 auto;
    min-width: 0;
  }

  .dp-month-header {
    padding: 8px 18px 4px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.45;
    color: var(--primary-text-color);
    border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
  }

  .dp-month-header:first-child {
    border-top: 0;
  }

  .dp-day-label {
    flex: 1 1 auto;
    text-align: left;
    font-size: 15px;
    font-weight: 600;
  }

  .iconbtn {
    width: 44px;
    height: 44px;
    border: 0;
    background: transparent;
    color: var(--cgc-ctrl-chevron, var(--cgc-txt));
    display: grid;
    place-items: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    flex: 0 0 auto;
  }

  .iconbtn[disabled] {
    color: var(--cgc-txt-dis);
    cursor: default;
  }

  .dateinfo {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 14px;
    color: var(--cgc-ctrl-txt, var(--cgc-txt));
    font-size: 13px;
    font-weight: 800;
  }

  .datepick {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .dateinfo .txt {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .timeline {
    margin: 0;
    padding: 0;
    min-height: 0;
  }

  .tthumbs {
    min-width: 0;

    /* Hide the scrollbar on both orientations — gallery uses snap-points and
     * inertia instead of an explicit scrollbar. */
    &::-webkit-scrollbar {
      display: none;
    }
    &.horizontal {
      display: flex;
      align-items: center;
      gap: var(--cgc-thumb-gap, 12px);
      margin-top: 0;
      margin-bottom: 0;
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 2px;
      overscroll-behavior-x: contain;
      overscroll-behavior-y: none;
      scrollbar-width: none;
    }
    &.vertical {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      align-items: start;
      gap: var(--cgc-thumb-gap, 12px);
      margin-top: 0;
      margin-bottom: 0;
      width: 100%;
      max-height: var(--cgc-thumbs-max-h, 320px);
      overflow-y: auto;
      overflow-x: hidden;
      overscroll-behavior-y: contain;
      overscroll-behavior-x: none;
      padding-right: 2px;
      scrollbar-width: none;

      & .tthumb {
        width: 100%;
        height: auto;
        min-width: 0;
      }
      & :is(.timg, .tph) {
        width: 100%;
        height: 100%;
        aspect-ratio: 1 / 1;
      }
    }
  }

  .tthumb {
    border: 0;
    padding: 0;
    overflow: hidden;
    background: var(--cgc-thumb-bg);
    outline: none;
    cursor: pointer;
    position: relative;
    flex: 0 0 auto;
    scroll-snap-align: start;
    -webkit-touch-callout: none;
    user-select: none;
    opacity: 0.3;
    transform: scale(0.94);
    transition:
      transform 0.1s ease,
      opacity 0.12s ease,
      box-shadow 0.14s ease;

    &:focus {
      outline: none;
    }
    &.on {
      opacity: 1;
      transform: scale(1);
      z-index: 2;
    }
    &:active {
      transform: scale(0.97);
    }
    &.on:active {
      transform: scale(0.985);
    }
    &::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      box-sizing: border-box;
    }
  }

  .timg {
    width: 100%;
    height: 100%;
    object-fit: var(--cgc-object-fit, cover);
    display: block;
  }

  .tph {
    width: 100%;
    height: 100%;
    background: var(--cgc-thumb-bg);
    box-sizing: border-box;

    /* Shared structure for the three "non-image" states. */
    &:is(.broken, .spinner, .disabled) {
      display: grid;
      place-items: center;
    }
    /* Broken: capture/fetch failed (.broken) or capture is disabled
     * (.disabled). The error icon styling is identical between them. */
    &.broken {
      background: var(--cgc-thumb-broken-bg, rgba(255, 90, 70, 0.08));
      color: var(--cgc-thumb-broken-color, rgba(255, 255, 255, 0.55));
    }
    &.disabled {
      color: var(--cgc-thumb-disabled-color, rgba(255, 255, 255, 0.32));
    }
    &:is(.broken, .disabled) ha-icon {
      --mdc-icon-size: 28px;
      --ha-icon-size: 28px;
      width: 28px;
      height: 28px;
      opacity: 0.7;
    }
    /* Active loading state — a fetch or capture is in flight for this
     * item. Distinguishes "we're working on it" from the static skeleton
     * (which can also mean "off-screen idle"). */
    &.spinner::after {
      content: "";
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 2px solid var(--cgc-spinner-track, rgba(255, 255, 255, 0.15));
      border-top-color: var(--cgc-spinner-color, rgba(255, 255, 255, 0.7));
      animation: cgc-thumb-spin 0.8s linear infinite;
    }
  }

  /* Shared loading-shimmer used by thumbnail / preview / live skeletons.
   * A subtle highlight band sweeps across the surface so users see the
   * card is *doing something* on cold start, instead of staring at flat
   * placeholders. Disabled under prefers-reduced-motion. */
  @keyframes cgc-shimmer {
    0% {
      background-position: 200% 0%;
    }
    100% {
      background-position: -200% 0%;
    }
  }
  @keyframes cgc-thumb-spin {
    to {
      transform: rotate(360deg);
    }
  }

  :is(.tph.skeleton, .preview-skeleton, .live-card-host:empty) {
    background-size: 200% 100%;
    animation: cgc-shimmer 1.4s ease-in-out infinite;
  }
  .tph.skeleton {
    background: linear-gradient(
      90deg,
      var(--cgc-thumb-bg) 0%,
      var(--cgc-skeleton-highlight, rgba(255, 255, 255, 0.06)) 50%,
      var(--cgc-thumb-bg) 100%
    );
  }
  .preview-skeleton {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(
      90deg,
      var(--cgc-preview-bg, #000) 0%,
      var(--cgc-skeleton-highlight, rgba(255, 255, 255, 0.05)) 50%,
      var(--cgc-preview-bg, #000) 100%
    );
    border-radius: inherit;
  }
  /* Live host shows the same shimmer while waiting for the inner card
   * to mount. _mountLiveCard clears innerHTML before appending, so the
   * :empty selector accurately tracks "live element hasn't mounted yet". */
  .live-card-host:empty {
    background: linear-gradient(
      90deg,
      rgba(0, 0, 0, 0.55) 0%,
      var(--cgc-skeleton-highlight, rgba(255, 255, 255, 0.05)) 50%,
      rgba(0, 0, 0, 0.55) 100%
    );
  }

  @media (prefers-reduced-motion: reduce) {
    :is(.tph.skeleton, .preview-skeleton, .live-card-host:empty, .tph.spinner::after) {
      animation: none;
    }
  }

  /* When the timestamp bar is actually shown, inset the broken-state's
       * centering area by the bar height so the icon sits visually centered
       * in the *visible* image region instead of the absolute thumb center. */
  .tthumb.bar-bottom.with-bar :is(.tph.broken, .tph.disabled, .tph.spinner) {
    padding-bottom: 26px;
  }
  .tthumb.bar-top.with-bar :is(.tph.broken, .tph.disabled, .tph.spinner) {
    padding-top: 26px;
  }

  .tph.broken ha-icon {
    --mdc-icon-size: 28px;
    --ha-icon-size: 28px;
    width: 28px;
    height: 28px;
    opacity: 0.7;
  }

  .tbar {
    position: absolute;
    left: 0;
    right: 0;
    height: 26px;
    padding: 0 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--cgc-tbar-bg);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    font-size: 11px;
    font-weight: 800;
    color: var(--cgc-tbar-txt, var(--cgc-txt));
    pointer-events: none;
    z-index: 2;

    &.bottom {
      bottom: 0;
      border-radius: 0 0 var(--cgc-thumb-radius, 10px) var(--cgc-thumb-radius, 10px);
    }
    &.top {
      top: 0;
      border-radius: var(--cgc-thumb-radius, 10px) var(--cgc-thumb-radius, 10px) 0 0;
    }
    &.hidden {
      display: none;
    }
  }

  .tbar-left {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tbar-icon {
    --ha-icon-size: 16px;
    --mdc-icon-size: var(--ha-icon-size);
    width: var(--ha-icon-size);
    height: var(--ha-icon-size);
    flex: 0 0 auto;
  }

  .fav-btn {
    position: absolute;
    bottom: 4px;
    left: 4px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.5);
    --mdc-icon-size: 22px;
    --ha-icon-size: 22px;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s ease;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
    z-index: 3;
  }

  /* Bar at the bottom would overlay the default bottom-left favorite
         button (the bar has an opaque blur background). Move the button to
         the top-left corner in that case so it stays visible. */
  .tthumb.bar-bottom .fav-btn {
    top: 4px;
    bottom: auto;
  }

  .fav-btn.on {
    color: gold;
  }

  .selOverlay {
    position: absolute;
    inset: 0;
    background: var(--cgc-sel-ov-a);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: 0.12s ease;
    pointer-events: none;
  }

  .selOverlay.on {
    opacity: 1;
    background: rgba(244, 67, 54, 0.4);
  }

  .bulkbar {
    margin: 0;
    padding: 8px 10px;
    height: 28px;
    border-radius: 12px;

    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    background: var(--cgc-bulk-bg);
    border: 1px solid var(--cgc-bulk-border);

    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);

    position: relative;
    z-index: 2;
  }

  .bulkbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 auto;
  }

  .bulkbar-text {
    font-size: 14px;
    font-weight: 700;
    color: var(--cgc-txt);
    white-space: nowrap;
  }

  .bulkactions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bulkaction {
    height: 34px;
    padding: 0 12px;
    border-radius: 12px;
    border: 1px solid var(--cgc-ui-stroke);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    background: var(--cgc-ui-bg);
    color: var(--cgc-txt);

    & ha-icon {
      --ha-icon-size: 16px;
      --mdc-icon-size: var(--ha-icon-size);
    }
    &[disabled] {
      opacity: 0.45;
      cursor: default;
    }
  }

  .bulkcancel {
    background: var(--cgc-ui-bg);
  }

  .bulkdelete {
    background: var(--cgc-delete-bg, var(--cgc-live-active-bg, var(--error-color, #c62828)));
    color: var(--text-primary-color, #fff);
    border: 1px solid var(--cgc-delete-bg, var(--cgc-live-active-bg, var(--error-color, #c62828)));
  }

  @media (max-width: 700px) {
    .bulkbar {
      padding: 10px 12px;
      border-radius: 20px;
      gap: 12px;
      min-height: 64px;
    }

    .bulkbar-text {
      font-size: 15px;
    }

    .bulkactions {
      gap: 10px;
    }

    .bulkaction {
      height: 48px;
      padding: 0 16px;
      border-radius: 16px;
      font-size: 15px;
      gap: 10px;
    }

    .bulkaction ha-icon {
      --ha-icon-size: 20px;
    }
  }

  .bulk-floating-hint {
    position: absolute;
    left: 50%;
    top: 58px;
    transform: translateX(-50%);
    padding: 10px 16px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.76);
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    white-space: nowrap;
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.24);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    z-index: 30;
    pointer-events: none;
    animation: bulkHintFade 5s ease forwards;
  }

  @keyframes bulkHintFade {
    0% {
      opacity: 0;
      transform: translate(-50%, -6px);
    }
    8% {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    90% {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -6px);
    }
  }

  .cgc-error-toast {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: flex-start;
    gap: 10px;
    max-width: min(420px, 92%);
    padding: 12px 16px;
    border-radius: 12px;
    background: rgba(180, 35, 35, 0.95);
    color: #fff;
    font-size: 13px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    z-index: 60;
    cursor: pointer;
    animation: cgcErrorToastIn 0.22s ease-out;
  }
  .cgc-error-toast ha-icon {
    flex: 0 0 auto;
    --mdc-icon-size: 22px;
    color: #fff;
    margin-top: 1px;
  }
  .cgc-error-toast-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cgc-error-toast-title {
    font-weight: 700;
    font-size: 13px;
  }
  .cgc-error-toast-msg {
    font-weight: 400;
    font-size: 12px;
    opacity: 0.92;
    line-height: 1.35;
  }
  @keyframes cgcErrorToastIn {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-50% + 8px));
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }

  .empty {
    padding: 12px;
    border-radius: 14px;
    background: var(--cgc-ui-bg);
    color: var(--cgc-txt);
  }

  .thumb-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
  }

  .thumb-menu-sheet {
    position: fixed;
    left: 50%;
    bottom: 14px;
    transform: translateX(-50%);
    width: min(94vw, 420px);
    border-radius: 24px;
    overflow: hidden;
    z-index: 9999;
    background: var(--card-background-color, rgba(24, 24, 28, 0.96));
    color: var(--primary-text-color);
    border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
    box-shadow: 0 22px 48px rgba(0, 0, 0, 0.34);
  }

  .thumb-menu-handle {
    width: 42px;
    height: 5px;
    border-radius: 999px;
    background: var(--cgc-ui-stroke);
    margin: 10px auto 6px;
  }

  .thumb-menu-head {
    padding: 8px 18px 12px;
    text-align: center;
  }

  .thumb-menu-subtitle {
    margin-top: 6px;
    font-size: 12px;
    font-weight: 700;
    color: var(--cgc-txt2);
  }

  .thumb-menu-list {
    display: flex;
    flex-direction: column;
    padding: 0 8px 8px;
  }

  .thumb-menu-item {
    width: 100%;
    border: 0;
    background: transparent;
    color: var(--primary-text-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 14px;
    border-radius: 16px;
    cursor: pointer;
    text-align: left;

    &:hover {
      background: var(--cgc-ui-bg);
    }
    &.danger {
      color: var(--error-color, #ff8a80);
    }
  }

  .thumb-menu-item-left {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .thumb-menu-item-left ha-icon {
    --ha-icon-size: 20px;
    --mdc-icon-size: var(--ha-icon-size);
    width: var(--ha-icon-size);
    height: var(--ha-icon-size);
    flex: 0 0 auto;
  }

  .thumb-menu-item-left span {
    font-size: 15px;
    font-weight: 800;
  }

  .thumb-menu-item-arrow {
    --ha-icon-size: 18px;
    --mdc-icon-size: var(--ha-icon-size);
    width: var(--ha-icon-size);
    height: var(--ha-icon-size);
    color: var(--cgc-txt-dis);
    flex: 0 0 auto;
  }

  .thumb-menu-footer {
    padding: 0 12px 12px;
  }

  .thumb-menu-cancel {
    width: 100%;
    border: 0;
    border-radius: 16px;
    padding: 15px 16px;
    cursor: pointer;
    background: var(--cgc-ui-bg);
    color: var(--primary-text-color);
    font-size: 15px;
    font-weight: 900;
  }

  @media (max-width: 420px) {
    .topbar {
      gap: 6px;
    }

    .datepill.has-filters .dateinfo {
      font-size: 11px;
      padding: 0 10px;
    }

    .segbtn {
      padding: 9px 12px;
    }

    .iconbtn {
      width: 40px;
      height: 40px;
    }

    .dateinfo {
      padding: 9px 12px;
    }

    .objfilters {
      gap: 6px;
    }

    .objbtn {
      border-radius: 6px;
    }

    .objbtn ha-icon {
      --ha-icon-size: 20px;
    }

    .live-picker {
      width: min(92%, 440px);
      border-radius: 18px;
    }

    .live-picker-title {
      font-size: 15px;
    }

    .live-picker-item {
      padding: 14px 16px;
    }

    .bulk-floating-hint {
      top: 50%;
      max-width: calc(100% - 24px);
      font-size: 12px;
      padding: 9px 14px;
    }

    .thumb-menu-sheet {
      width: min(96vw, 420px);
      bottom: 10px;
      border-radius: 22px;
    }

    .tthumbs.vertical {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
`;
