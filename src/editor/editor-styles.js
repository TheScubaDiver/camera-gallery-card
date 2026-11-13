/**
 * Styles for the visual editor (camera-gallery-card-editor). The editor
 * renders its shadow DOM as an HTML string and inlines this in a <style>.
 * Moved out of index.js unchanged.
 */

export const EDITOR_CSS = `
        /* Inter webfont (v2-only). @import must be first; falls back to
           system stack when the user is offline. ~30KB, cached after
           first load. */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        :host {
          display: block;
          padding: 8px 0;
          color: var(--ed-text);
          box-sizing: border-box;
          min-width: 0;
          scrollbar-width: none;
          /* Reserve scrollbar gutter so tab-switches between short/long
             tabs don't shift the content sideways when Chrome's overlay
             scrollbar appears. No-op when there's no overflow. */
          scrollbar-gutter: stable;
        }
        :host::-webkit-scrollbar { display: none; }

        .wrap {
          display: grid;
          gap: var(--ed-space-3);
          min-width: 0;
        }

        /* v2 uses Inter; v1 inherits HA's Roboto. Stack falls back to
           the OS UI font if Inter didn't load (offline install). */
        .wrap.v2,
        .wrap.v2 input,
        .wrap.v2 textarea,
        .wrap.v2 select,
        .wrap.v2 button {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        /* v2 wrap owns the scrolling: max-height keeps the editor
           within viewport so the outer Lovelace dialog doesn't need
           its own scrollbar, and scrollbar-width:none + ::-webkit-
           scrollbar:display:none hide ours. Outcome: scrollable
           content, no visible scrollbar, no layout shift on tab
           switches. v1 keeps its original behavior. */
        .wrap.v2 {
          max-height: calc(100vh - 120px);
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: none;
        }
        .wrap.v2::-webkit-scrollbar { display: none; }

        /* Keeps short tabs (Source) from snapping to a tiny height
           when wrap is scrollable — the panel stays a comfortable
           size instead of hugging its content. */
        .wrap.v2 .tabpanel {
          min-height: 70vh;
        }

        .desc,
        code {
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .tabs {
          display: grid;
          gap: var(--ed-space-3);
        }

        .tabbar {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
          padding: 10px;
          border-radius: var(--ed-radius-panel);
          background: var(--ed-section-bg);
          border: 1px solid var(--ed-section-border);
          box-shadow: var(--ed-section-glow);
        }

        .tabbtn {
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid var(--ed-tab-border);
          background: var(--ed-tab-bg);
          color: var(--ed-tab-txt);
          border-radius: 14px;
          min-height: 46px;
          padding: 10px 14px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 900;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-align: center;
          transition:
            background 0.18s ease,
            border-color 0.18s ease,
            color 0.18s ease,
            transform 0.18s ease,
            box-shadow 0.18s ease;
          min-width: 0;
          box-shadow: var(--ed-section-glow);
        }

        .tabbtn:hover {
          border-color: var(--ed-tab-border);
        }

        .tabbtn .cgc-svg-icon {
          flex: 0 0 auto;
        }

        .tabbtn.on {
          background: var(--ed-tab-on-bg);
          border-color: var(--ed-tab-on-border);
          color: var(--ed-tab-on-txt);
          box-shadow: var(--ed-shadow-press);
        }

        /* v2 tabs left-align icon + label. v1 keeps center-alignment. */
        .wrap.v2 .tabbtn {
          justify-content: flex-start;
          text-align: left;
          padding-left: 16px;
          font-weight: 500;
        }
        .wrap.v2 .tabbtn.on {
          font-weight: 600;
        }

        /* v2 typography: dial back the heavy bold weight on labels so
           only structural headings (tabs + collapsible heads) read as
           bold. v1 keeps its original weights. */
        .wrap.v2 .lbl {
          font-weight: 500;
        }
        .wrap.v2 .lbl strong {
          font-weight: 700;
        }
        .wrap.v2 .seg {
          font-weight: 500;
        }
        .wrap.v2 .seg.on {
          font-weight: 600;
        }
        /* All buttons in v2 default to weight 500. Active states
           (.tabbtn.on, .seg.on) keep their own 600 override. */
        .wrap.v2 button {
          font-weight: 500;
        }

        /* Object-filter chip icons: bump from 18px to 22px so the
           busier MDI paths (bird, dog, bicycle) stay legible. */
        .wrap.v2 .objchip-icon .cgc-svg-icon {
          width: 22px;
          height: 22px;
        }

        /* Styling tab wraps its collapsibles in an extra .style-sections
           div with gap: 8px, while the other v2 tabs use .tabpanel's
           gap: 14px directly. Match here so spacing is consistent. */
        .wrap.v2 .style-sections {
          gap: 14px;
        }

        /* v2 rows: drop the per-row card (border + background + chunky
           padding) — collapsible already provides the container. Use a
           single hairline divider between rows instead. */
        .wrap.v2 .row {
          background: transparent;
          border: none;
          border-radius: 0;
          padding: 12px 2px;
          border-bottom: 1px solid var(--ed-row-border);
        }
        .wrap.v2 .row:last-child {
          border-bottom: none;
        }
        .wrap.v2 .row:hover {
          background: transparent;
          border-color: transparent;
          border-bottom-color: var(--ed-row-border);
        }
        /* Right-aligned "Expand all / Collapse all" toggle at the top
           of v2 tabpanels that contain multiple collapsibles. */
        .wrap.v2 .v2-expand-row {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 6px;
        }
        /* Live-tab variant: master toggle on the left, expand link on the
           right. Same vertical rhythm as .v2-expand-row. */
        .wrap.v2 .v2-tab-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 6px;
        }
        .wrap.v2 .v2-tab-header-toggle {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .wrap.v2 .v2-tab-header-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--ed-text, #e6e6e8);
        }
        .wrap.v2 .v2-expand-all {
          background: transparent;
          border: none;
          color: var(--ed-text2);
          font-size: 11px;
          font-family: inherit;
          font-weight: 500;
          padding: 2px 6px;
          cursor: pointer;
          opacity: 0.7;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-radius: 4px;
          transition: opacity 0.15s, background 0.15s;
        }
        .wrap.v2 .v2-expand-all:hover {
          opacity: 1;
          background: rgba(255,255,255,0.04);
        }

        /* Divider between stacked toggles inside a .subrows wrapper
           (e.g. Autoplay / Auto muted) — they share one .row so the
           per-row bottom-border doesn't separate them. */
        .wrap.v2 .subrows .row-head + .row-head {
          border-top: 1px solid var(--ed-row-border);
          padding-top: 10px;
          margin-top: 8px;
        }

        .tabpanel {
          padding: 16px;
          padding-right: 20px;
          border-radius: var(--ed-radius-panel);
          background: var(--ed-section-bg);
          border: 1px solid var(--ed-section-border);
          display: grid;
          gap: 14px;
          align-content: start;
          box-shadow: var(--ed-section-glow);
          box-sizing: border-box;
          scrollbar-width: none;
        }
        .tabpanel::-webkit-scrollbar { display: none; }
        .wrap { scrollbar-width: none; }
        .wrap::-webkit-scrollbar { display: none; }

        .row {
          display: grid;
          gap: 12px;
          padding: 16px;
          border-radius: var(--ed-radius-row);
          background: var(--ed-row-bg);
          border: 1px solid var(--ed-row-border);
          color: var(--ed-text);
          min-width: 0;
          transition:
            background 0.18s ease,
            border-color 0.18s ease,
            box-shadow 0.18s ease;
        }

        .row:hover {
          border-color: var(--ed-row-border);
        }

        .row-disabled {
          opacity: 0.6;
        }

        .row-disabled .lbl {
          color: var(--ed-text2);
        }

        .row-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          min-width: 0;
        }

        .row-head > :first-child {
          min-width: 0;
          flex: 1 1 auto;
          display: grid;
          gap: 6px;
        }

        .row-inline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .row-inline .lbl {
          margin: 0;
        }

        .row-inline #bgcolor-host {
          display: flex;
          align-items: center;
          flex: 0 0 auto;
        }

        #bgcolor {
          width: 42px;
          height: 28px;
          padding: 0;
          border: 1px solid var(--ed-input-border);
          border-radius: 6px;
          background: none;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
        }

        #bgcolor::-webkit-color-swatch-wrapper {
          padding: 0;
        }

        #bgcolor::-webkit-color-swatch {
          border: none;
          border-radius: 6px;
        }

        .lbl {
          font-size: 13px;
          font-weight: 950;
          color: var(--ed-text);
          line-height: 1.2;
          letter-spacing: 0.01em;
        }

        .desc {
          font-size: 12px;
          opacity: 0.88;
          color: var(--ed-text2);
          line-height: 1.45;
        }

        code {
          opacity: 0.95;
        }

        .cgc-range {
          width: 100%;
          cursor: pointer;
          accent-color: var(--primary-color, #03a9f4);
          height: 4px;
          -webkit-appearance: none;
          appearance: none;
          border-radius: 2px;
          background: color-mix(in srgb, var(--primary-color, #03a9f4) 30%, var(--divider-color, #e0e0e0));
          outline: none;
        }
        .cgc-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--primary-color, #03a9f4);
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          cursor: pointer;
        }
        .cgc-range:disabled { opacity: 0.45; cursor: not-allowed; }
        .cgc-switch { display: inline-flex; align-items: center; cursor: pointer; flex-shrink: 0; }
        .cgc-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
        .cgc-track { width: 36px; height: 20px; border-radius: 10px; background: var(--switch-unchecked-track-color, rgba(0,0,0,0.26)); position: relative; transition: background 0.2s; flex-shrink: 0; }
        .cgc-track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
        .cgc-switch input:checked + .cgc-track { background: var(--switch-checked-track-color, var(--primary-color, #03a9f4)); }
        .cgc-switch input:checked + .cgc-track::after { transform: translateX(16px); }
        .cgc-switch input:disabled + .cgc-track { opacity: 0.45; cursor: not-allowed; }

        .field {
          position: relative;
          min-width: 0;
        }
        /* Icon fields show the icon they hold (#287). */
        .field.has-icon-preview > .ed-input {
          padding-left: 38px;
        }
        .field.has-icon-preview > .icon-preview {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          --mdc-icon-size: 18px;
          color: var(--ed-text2);
          pointer-events: none;
          z-index: 1;
        }

        .field textarea {
          width: 100%;
          box-sizing: border-box;
          border-radius: var(--ed-radius-input);
          border: 1px solid var(--ed-input-border);
          background: var(--ed-input-bg);
          color: var(--ed-text);
          padding: 13px 14px;
          font-size: 13px;
          font-weight: 800;
          outline: none;
          resize: vertical;
          min-height: 112px;
          line-height: 1.45;
          white-space: pre-wrap;
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            Monaco,
            Consolas,
            "Liberation Mono",
            "Courier New",
            monospace;
          transition:
            border-color 0.16s ease,
            box-shadow 0.16s ease,
            background 0.16s ease;
          box-shadow: var(--ed-section-glow);
        }

        #stylevars {
          font-weight: 500;
          cursor: text;
          user-select: text;
          -webkit-user-select: text;
          line-height: 1.5;
        }

        .field textarea::placeholder {
          color: color-mix(in srgb, var(--ed-text2) 82%, transparent);
        }

        .field textarea:focus {
          border-color: color-mix(
            in srgb,
            var(--ed-input-border) 25%,
            var(--primary-color, #03a9f4) 75%
          );
          box-shadow:
            0 0 0 3px var(--ed-focus-ring),
            var(--ed-section-glow);
        }

        .field textarea:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .field.valid textarea {
          border-color: var(--ed-valid);
        }

        .field.invalid textarea {
          border-color: var(--ed-invalid);
        }

        .suggestions {
          position: absolute;
          left: 0;
          right: 0;
          top: calc(100% + 8px);
          background: var(--ed-sugg-bg);
          border: 1px solid var(--ed-sugg-border);
          border-radius: 14px;
          box-shadow: var(--ed-shadow-float);
          padding: 8px;
          display: grid;
          gap: 4px;
          z-index: 999;
          max-height: 280px;
          overflow: auto;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .suggestions[hidden] {
          display: none;
        }

        .sugg-label {
          padding: 6px 10px 8px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--ed-text2);
        }

        .sugg-item {
          appearance: none;
          -webkit-appearance: none;
          border: 0;
          background: transparent;
          color: var(--ed-text);
          text-align: left;
          padding: 11px 12px;
          border-radius: 10px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            Monaco,
            Consolas,
            "Liberation Mono",
            "Courier New",
            monospace;
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
          word-break: break-word;
          overflow-wrap: anywhere;
          line-height: 1.35;
          transition:
            background 0.14s ease,
            transform 0.14s ease;
        }

        .sugg-item:hover {
          background: var(--ed-sugg-hover);
        }

        .sugg-item.active {
          background: var(--ed-sugg-active);
        }

        .sugg-active-path {
          padding: 9px 10px 4px;
          font-size: 11px;
          opacity: 0.75;
          word-break: break-word;
          overflow-wrap: anywhere;
          border-top: 1px solid var(--ed-sugg-border);
          margin-top: 4px;
          color: var(--ed-text2);
        }

        .selectwrap {
          position: relative;
          min-width: 0;
        }

        .select {
          width: 100%;
          box-sizing: border-box;
          border-radius: var(--ed-radius-input);
          border: 1px solid var(--ed-select-border);
          background: var(--ed-select-bg);
          color: var(--ed-text);
          padding: 12px 42px 12px 14px;
          font-size: 13px;
          font-weight: 800;
          outline: none;
          min-width: 0;
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          transition:
            border-color 0.16s ease,
            box-shadow 0.16s ease,
            background 0.16s ease;
          box-shadow: var(--ed-section-glow);
        }

        .select:hover {
          border-color: color-mix(
            in srgb,
            var(--ed-select-border) 70%,
            var(--ed-text2) 30%
          );
        }

        .color-grid {
          display: grid;
          gap: 10px;
        }

        .color-row {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 12px;
        }

        .color-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .color-row .lbl {
          margin: 0;
        }

        .color-reset {
          appearance: none;
          border: none;
          background: none;
          padding: 0;
          margin-left: 4px;
          width: 20px;
          height: 20px;
          display: grid;
          place-items: center;
          cursor: pointer;
          color: var(--ed-text2);
          opacity: 0.7;
          transition:
            opacity 0.15s ease,
            transform 0.15s ease,
            color 0.15s ease;
        }

        .color-reset:hover {
          opacity: 1;
          border-color: var(--ed-tab-border);
          color: var(--ed-text);
        }

        .color-reset .cgc-svg-icon { display: block; }

        .select:focus {
          border-color: color-mix(
            in srgb,
            var(--ed-select-border) 25%,
            var(--primary-color, #03a9f4) 75%
          );
          box-shadow:
            0 0 0 3px var(--ed-focus-ring),
            var(--ed-section-glow);
        }

        .select:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .selarrow {
          position: absolute;
          top: 50%;
          right: 16px;
          width: 10px;
          height: 10px;
          transform: translateY(-60%) rotate(45deg);
          border-right: 2px solid var(--ed-arrow);
          border-bottom: 2px solid var(--ed-arrow);
          pointer-events: none;
          opacity: 0.9;
        }

        .select.invalid {
          border-color: var(--ed-invalid);
        }

        .segwrap {
          display: flex;
          gap: 8px;
        }

        .desc + .segwrap {
          margin-top: 8px;
        }

        .seg {
          flex: 1;
          border: 1px solid var(--ed-seg-border);
          background: var(--ed-seg-bg);
          color: var(--ed-seg-txt);
          border-radius: 12px;
          padding: 11px 0;
          font-size: 13px;
          font-weight: 850;
          cursor: pointer;
          min-width: 0;
          transition:
            background 0.16s ease,
            border-color 0.16s ease,
            color 0.16s ease,
            transform 0.16s ease,
            box-shadow 0.16s ease;
        }

        .seg:hover {
          border-color: var(--ed-tab-border);
        }

        .seg.on {
          background: var(--ed-seg-on-bg);
          color: var(--ed-seg-on-txt);
          border-color: transparent;
          box-shadow: var(--ed-shadow-press);
        }

        .togrow {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          min-width: 0;
          flex: 0 0 auto;
          white-space: nowrap;
        }

        .barrow {
          display: grid;
          gap: 10px;
          min-width: 0;
        }

        .barrow-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .pillval {
          min-width: 56px;
          text-align: center;
          padding: 6px 10px;
          border-radius: var(--ed-radius-pill);
          background: var(--ed-pill-bg);
          border: 1px solid var(--ed-pill-border);
          font-size: 12px;
          font-weight: 1000;
          color: var(--ed-pill-txt);
          box-shadow: var(--ed-section-glow);
        }

        .muted {
          opacity: var(--ed-muted);
        }

        .hint {
          margin: 2px 0 0 0;
          font-size: 12px;
          opacity: 0.92;
          color: var(--ed-text2);
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .hint .cgc-svg-icon {
          color: var(--ed-text2);
          flex-shrink: 0;
        }

        .hint a {
          color: var(--primary-color);
          text-decoration: none;
          font-weight: 700;
        }

        .hint a:hover {
          text-decoration: underline;
        }

        .row-actions {
          display: flex;
          gap: 10px;
          margin-top: 10px;
        }

        .row-actions .actionbtn {
          flex: 1;
          justify-content: center;
        }

        .actionbtn {
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid var(--ed-input-border);
          background: var(--ed-input-bg);
          color: var(--ed-text);
          border-radius: 12px;
          min-height: 40px;
          padding: 0 14px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 900;
          transition:
            background 0.18s ease,
            border-color 0.18s ease,
            transform 0.18s ease,
            box-shadow 0.18s ease;
        }

        .actionbtn:hover {
          border-color: color-mix(
            in srgb,
            var(--ed-input-border) 65%,
            var(--ed-text2) 35%
          );
        }

        .actionbtn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          transform: none;
        }

        .actionbtn .cgc-svg-icon { flex-shrink: 0; }

        .livecam-tags {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 6px;
        }
        .livecam-rows {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 6px;
          width: 100%;
          box-sizing: border-box;
          min-width: 0;
        }
        .livecam-row {
          background: var(--ed-input-bg);
          border: 1px solid var(--ed-input-border);
          border-radius: 10px;
          overflow: hidden;
          width: 100%;
          box-sizing: border-box;
          min-width: 0;
          transition: opacity 0.15s, box-shadow 0.15s;
        }
        .livecam-row.dnd-dragging { opacity: 0.35; }
        .livecam-row.dnd-over { box-shadow: -3px 0 0 0 var(--primary-color, #03a9f4); }

        /* Pill row DnD (Pills collapsible). Single-line layout: grip,
         * label, switch — all centred on one row. */
        .pills-dnd-list { display: flex; flex-direction: column; gap: 6px; }
        .ctl-zones { display: flex; flex-direction: column; gap: 10px; }
        .ctl-zone { display: flex; flex-direction: column; gap: 6px; border: 1px dashed var(--ed-row-border, rgba(127,127,127,0.35)); border-radius: 12px; padding: 8px; transition: border-color 0.15s, background 0.15s; }
        .ctl-zone.ctl-zone-over { border-color: var(--primary-color, #03a9f4); background: rgba(3, 169, 244, 0.06); }
        .ctl-zone-head { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--ed-text2); padding: 0 2px; }
        .ctl-zone-head span:first-child { font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
        .ctl-zone-empty { font-size: 12px; color: var(--ed-text2); text-align: center; padding: 8px 0; }
        .pill-dnd-row { cursor: default; transition: opacity 0.15s, box-shadow 0.15s; }
        .pill-dnd-row.pill-dnd-dragging { opacity: 0.4; }
        .pill-dnd-row.pill-dnd-over { box-shadow: 0 -2px 0 0 var(--primary-color, #03a9f4); }
        /* Disabled pills sit at the bottom (sort) and are dimmed so the
         * eye lands on the active set first. The switch itself stays at
         * full opacity so users can still see + click it cleanly. */
        .pill-dnd-row.pill-dnd-disabled .pill-drag-grip,
        .pill-dnd-row.pill-dnd-disabled .pill-dnd-icon,
        .pill-dnd-row.pill-dnd-disabled .pill-dnd-label { opacity: 0.45; }
        /* Icon between grip + label — fixed-width slot so labels line
         * up vertically across rows even when an entry has no icon. */
        .pill-dnd-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 18px;
          opacity: 0.85;
        }
        /* Text preview (for counter / speed / time pills which render
         * text at runtime, not an icon). Tabular-nums so widths align. */
        .pill-dnd-preview-text {
          font-size: 11px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          line-height: 1;
          letter-spacing: 0.02em;
        }
        .pill-dnd-line {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .pill-dnd-label {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pill-drag-grip {
          display: inline-flex; align-items: center; justify-content: center;
          width: 24px; height: 24px;
          font-size: 18px; line-height: 1;
          color: var(--ed-text2, #8b8b91);
          cursor: grab;
          user-select: none;
          touch-action: none;
          flex-shrink: 0;
        }
        .pill-drag-grip:active { cursor: grabbing; }
        .livecam-rowhead {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 10px;
          cursor: pointer;
          transition: background 0.12s ease;
        }
        .livecam-rowhead:hover { background: rgba(255,255,255,0.03); }
        .livecam-rowgrip {
          color: var(--ed-text2);
          font-size: 14px;
          line-height: 1;
          cursor: grab;
          user-select: none;
          opacity: 0.5;
          padding: 0 2px;
        }
        .livecam-rowname {
          flex: 1;
          font-size: 13px;
          font-weight: 500;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .livecam-rowent {
          opacity: 0.5;
          font-size: 10px;
          font-weight: 500;
          margin-left: 6px;
        }
        .livecam-rowmic {
          font-size: 11px;
          color: var(--ed-text2);
          font-family: ui-monospace, Menlo, monospace;
          opacity: 0.85;
        }
        .livecam-rowmic.none { opacity: 0.5; font-style: italic; font-family: inherit; }
        .livecam-chevron {
          color: var(--ed-text2);
          font-size: 14px;
          line-height: 1;
          transition: transform 0.18s ease;
          opacity: 0.5;
        }
        .livecam-row.open .livecam-chevron { transform: rotate(90deg); }
        .livecam-rowbody {
          display: none;
          padding: 8px 12px 12px;
          border-top: 1px solid var(--ed-row-border);
          background: rgba(0,0,0,0.18);
        }
        .livecam-row.open .livecam-rowbody > * + * { margin-top: 8px; }
        .livecam-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .livecam-row.open .livecam-rowbody { display: block; }
        .livecam-fieldrow {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .livecam-fieldrow label {
          font-size: 11px;
          color: var(--ed-text2);
          width: 80px;
          flex-shrink: 0;
        }
        /* Compact segmented control inside a camera row (e.g. Rotation):
           fill the row instead of shrinking to the labels, smaller pills. */
        .livecam-fieldrow .segwrap {
          flex: 1;
          gap: 4px;
          padding: 3px;
          border-radius: 10px;
          background: var(--ed-seg-bg);
          border: 1px solid var(--ed-seg-border);
        }
        .livecam-fieldrow .seg {
          padding: 6px 0;
          border-radius: 7px;
          font-size: 12px;
          border-color: transparent;
          background: transparent;
          font-variant-numeric: tabular-nums;
        }
        .livecam-fieldrow .seg.on {
          background: var(--ed-seg-on-bg);
          color: var(--ed-seg-on-txt);
        }
        .livecam-row-del {
          appearance: none;
          background: transparent;
          border: 1px solid var(--ed-input-border);
          color: var(--ed-text2);
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 11px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .livecam-row-del:hover {
          color: var(--error-color, #d32f2f);
          border-color: var(--error-color, #d32f2f);
        }

        /* ─── Inline crop tool (lives inside livecam-row) ─── */
        .livecam-crop-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .livecam-crop-toggle {
          appearance: none;
          background: rgba(0,0,0,0.18);
          border: 1px solid var(--ed-input-border);
          border-radius: 8px;
          color: var(--ed-text);
          padding: 8px 12px;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          text-align: left;
        }
        .livecam-crop-toggle:hover {
          border-color: rgba(255,255,255,0.16);
        }
        .livecam-crop-toggle.set { color: var(--accent-color, #ff9f43); }
        .livecam-crop-toggle.set .cgc-svg-icon { color: var(--accent-color, #ff9f43); }
        .livecam-crop-toggle-label { flex: 1; }
        .livecam-crop-toggle-status {
          font-size: 11px;
          color: var(--ed-text2);
          font-family: ui-monospace, "SF Mono", monospace;
        }
        .livecam-crop-toggle-chev {
          color: var(--ed-text2);
          font-size: 11px;
          width: 12px;
          text-align: center;
        }
        .livecam-crop-inline {
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: rgba(0,0,0,0.18);
          border: 1px solid var(--ed-input-border);
          border-radius: 8px;
          padding: 10px;
        }
        .livecam-crop-head {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .livecam-crop-reset { margin-left: auto; }
        .livecam-crop-aspect {
          appearance: none;
          background: var(--ed-input-bg);
          color: var(--ed-text);
          border: 1px solid var(--ed-input-border);
          padding: 4px 22px 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          cursor: pointer;
          background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
                            linear-gradient(135deg, currentColor 50%, transparent 50%);
          background-position: calc(100% - 11px) 50%, calc(100% - 7px) 50%;
          background-size: 4px 4px, 4px 4px;
          background-repeat: no-repeat;
        }
        .livecam-crop-reset {
          appearance: none;
          background: transparent;
          border: 1px solid var(--ed-input-border);
          color: var(--ed-text2);
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .livecam-crop-reset:hover {
          color: var(--ed-text);
          border-color: rgba(255,255,255,0.2);
        }
        .livecam-crop-stage {
          position: relative;
          width: 100%;
          background: #000;
          border-radius: 6px;
          overflow: hidden;
          user-select: none;
          touch-action: none;
        }
        .livecam-crop-img {
          width: 100%;
          height: auto;
          object-fit: cover;
          display: block;
          pointer-events: none;
          border-radius: inherit;
        }
        .livecam-crop-empty {
          aspect-ratio: 16 / 9;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--ed-text2);
          font-size: 12px;
          font-style: italic;
        }
        .livecam-crop-mask {
          position: absolute;
          background: rgba(0, 0, 0, 0.55);
          pointer-events: none;
        }
        .livecam-crop-mask.top    { top: 0;    left: 0; right: 0; }
        .livecam-crop-mask.bottom { bottom: 0; left: 0; right: 0; }
        .livecam-crop-mask.left   { left: 0; }
        .livecam-crop-mask.right  { right: 0; }
        .livecam-crop-rect {
          position: absolute;
          border: 2px solid var(--accent-color, #ff9f43);
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
          cursor: move;
          box-sizing: border-box;
        }
        /* Rule-of-thirds overlay — two thin lines on each axis dividing
         * the crop rect in thirds. Helps frame the subject. Drawn via
         * pseudo-elements so no extra DOM is needed; pointer-events:none
         * keeps drag interactions on the parent rect untouched. */
        .livecam-crop-rect::before,
        .livecam-crop-rect::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-repeat: no-repeat;
        }
        .livecam-crop-rect::before {
          background-image:
            linear-gradient(to right,
              transparent calc(33.333% - 0.5px),
              rgba(255, 255, 255, 0.35) calc(33.333% - 0.5px),
              rgba(255, 255, 255, 0.35) calc(33.333% + 0.5px),
              transparent calc(33.333% + 0.5px),
              transparent calc(66.666% - 0.5px),
              rgba(255, 255, 255, 0.35) calc(66.666% - 0.5px),
              rgba(255, 255, 255, 0.35) calc(66.666% + 0.5px),
              transparent calc(66.666% + 0.5px));
        }
        .livecam-crop-rect::after {
          background-image:
            linear-gradient(to bottom,
              transparent calc(33.333% - 0.5px),
              rgba(255, 255, 255, 0.35) calc(33.333% - 0.5px),
              rgba(255, 255, 255, 0.35) calc(33.333% + 0.5px),
              transparent calc(33.333% + 0.5px),
              transparent calc(66.666% - 0.5px),
              rgba(255, 255, 255, 0.35) calc(66.666% - 0.5px),
              rgba(255, 255, 255, 0.35) calc(66.666% + 0.5px),
              transparent calc(66.666% + 0.5px));
        }
        .livecam-crop-handle {
          position: absolute;
          width: 12px;
          height: 12px;
          background: var(--accent-color, #ff9f43);
          border: 2px solid #fff;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
          touch-action: none;
        }
        .livecam-crop-handle.h-tl { top: -6px;    left: -6px;    cursor: nwse-resize; }
        .livecam-crop-handle.h-tr { top: -6px;    right: -6px;   cursor: nesw-resize; }
        .livecam-crop-handle.h-bl { bottom: -6px; left: -6px;    cursor: nesw-resize; }
        .livecam-crop-handle.h-br { bottom: -6px; right: -6px;   cursor: nwse-resize; }
        .livecam-crop-info {
          font-size: 11px;
          color: var(--ed-text2);
          font-family: ui-monospace, "SF Mono", monospace;
          text-align: center;
        }
        .livecam-crop-info strong { color: var(--ed-text); font-weight: 700; }
        .livecam-tag {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 4px 4px 4px;
          background: var(--ed-chip-bg);
          border: 1px solid var(--ed-chip-border);
          border-radius: 999px;
          font-size: 12px;
          color: var(--ed-text);
          cursor: grab;
          transition: opacity 0.15s, box-shadow 0.15s;
        }
        .livecam-tag-del {
          border: none;
          background: none;
          cursor: pointer;
          color: var(--ed-text2);
          padding: 0 2px;
          font-size: 15px;
          line-height: 1;
        }

        .menubtn-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
        .menubtn-card {
          border: 1px solid var(--ed-input-border);
          border-radius: var(--ed-radius-input, 8px);
          padding: 8px 10px;
        }
        .menubtn-card-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .menubtn-fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .menubtn-fields > div { display: flex; flex-direction: column; gap: 3px; }

        .chip-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 4px;
        }

        .objchip {
          display: grid;
          grid-template-columns: 36px 1fr auto;
          align-items: center;
          column-gap: 10px;
          width: 100%;
          min-height: 44px;
          padding: 0 10px;
          border-radius: 12px;
          border: 1px solid var(--ed-chip-border);
          background: var(--ed-chip-bg);
          color: var(--ed-chip-txt);
          cursor: pointer;
          transition:
            background 0.18s ease,
            border-color 0.18s ease,
            color 0.18s ease,
            box-shadow 0.18s ease;
          box-sizing: border-box;
          box-shadow: var(--ed-section-glow);
        }

        .objchip:hover {
          border-color: var(--ed-tab-border);
        }

        .objchip.on {
          background: var(--ed-chip-on-bg);
          border-color: var(--ed-chip-on-border);
          color: var(--ed-chip-on-txt);
          box-shadow: var(--ed-shadow-chip);
        }

        .objchip.disabled {
          opacity: var(--ed-chip-disabled);
          cursor: not-allowed;
          transform: none;
        }

        .objchip-icon {
          width: 36px;
          height: 36px;
          min-width: 36px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: var(--ed-chip-icon-bg);
          transition: background 0.18s ease;
        }

        .objchip.on .objchip-icon {
          background: var(--ed-chip-on-icon-bg);
          color: inherit;
        }

        .objchip-icon .cgc-svg-icon {
          color: inherit;
        }

        .objchip-native-check {
          appearance: none;
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          min-width: 16px;
          border: 2px solid var(--ed-chip-border);
          border-radius: 4px;
          background: transparent;
          pointer-events: none;
          justify-self: end;
          transition: background 0.15s, border-color 0.15s;
          position: relative;
          flex-shrink: 0;
        }
        .objchip-native-check:checked {
          background: var(--primary-color, #03a9f4);
          border-color: var(--primary-color, #03a9f4);
        }
        .objchip-native-check:checked::after {
          content: '';
          position: absolute;
          top: 1px; left: 4px;
          width: 5px; height: 9px;
          border: 2px solid #fff;
          border-top: none; border-left: none;
          transform: rotate(45deg);
        }

        /* Custom filter styles */
        .custom-filter-add {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 16px;
        }

        .custom-filter-add .ed-input {
          flex: none;
          width: 100%;
        }

        .custom-filter-add #new-filter-icon { width: 100%; }

        .custom-filter-add .actionbtn {
          width: 100%;
          justify-content: center;
        }

        .custom-filter-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 12px;
        }

        .custom-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 8px 4px 12px;
          background: var(--ed-row-bg);
          border: 1px solid var(--ed-row-border);
          border-radius: 10px;
          min-height: 48px;
        }

        .custom-item-info {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 14px;
          font-weight: 500;
          color: var(--ed-text);
        }

        .custom-item-info ha-icon,
        .custom-item-info .cgc-svg-icon {
          color: var(--primary-color);
        }

        .remove-btn {
          color: var(--ed-invalid);
          cursor: pointer;
          background: none;
          border: none;
          padding: 8px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .remove-btn:hover {
          background: color-mix(in srgb, var(--ed-invalid) 12%, transparent);
        }

        .remove-btn .cgc-svg-icon { display: block; }


        .objchip-color {
          display: flex;
          align-items: center;
          justify-self: center;
          gap: 4px;
        }

        .objchip-color .cgc-color {
          width: 26px;
          height: 22px;
          min-width: 26px;
          flex: 0 0 26px;
        }

        .objchip-color .color-reset {
          width: 16px;
          height: 16px;
          margin-left: 0;
        }

        .objchip-color .color-reset .cgc-svg-icon { display: block; }

        .cgc-color {
          width: 42px;
          height: 28px;
          min-width: 42px;
          flex: 0 0 42px;
          padding: 0;
          border: 1px solid var(--ed-input-border);
          border-radius: 6px;
          background: none;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          position: relative;
          z-index: 2;
        }

        .cgc-color:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .cgc-color::-webkit-color-swatch-wrapper {
          padding: 0;
        }

        .cgc-color::-webkit-color-swatch {
          border: none;
          border-radius: 6px;
        }

        .subrows {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }

        .lbl.sub {
          font-size: 14px;
          font-weight: 500;
          opacity: 0.95;
        }

        .objmeta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 2px;
        }

        .countpill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: var(--ed-radius-pill);
          background: var(--ed-input-bg);
          border: 1px solid var(--ed-input-border);
          color: var(--ed-text);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.02em;
        }

        .browser-backdrop {
          position: fixed;
          inset: 0;
          background: var(--ed-backdrop);
          backdrop-filter: blur(10px) saturate(120%);
          -webkit-backdrop-filter: blur(10px) saturate(120%);
          z-index: 9998;
        }

        .browser-modal {
          position: fixed;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: min(92vw, 760px);
          max-height: min(84vh, 760px);
          background: var(--card-background-color, #fff);
          color: var(--ed-text);
          border: 1px solid var(--ed-sugg-border);
          border-radius: 20px;
          box-shadow: var(--ed-shadow-modal);
          z-index: 9999;
          display: grid;
          grid-template-rows: auto auto minmax(0, 1fr);
          overflow: hidden;
        }

        .browser-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          padding: 18px 18px 14px;
          border-bottom: 1px solid var(--ed-row-border);
        }

        .browser-head-copy {
          min-width: 0;
          display: grid;
          gap: 6px;
        }

        .browser-title {
          font-size: 16px;
          font-weight: 1000;
          line-height: 1.2;
        }

        .browser-path {
          font-size: 12px;
          color: var(--ed-text2);
          line-height: 1.45;
          word-break: break-word;
          overflow-wrap: anywhere;
        }

        .browser-iconbtn {
          appearance: none;
          -webkit-appearance: none;
          width: 38px;
          height: 38px;
          min-width: 38px;
          border-radius: 12px;
          border: 1px solid var(--ed-input-border);
          background: var(--ed-input-bg);
          color: var(--ed-text);
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        .browser-iconbtn .cgc-svg-icon { display: block; }

        .browser-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--ed-row-border);
          flex-wrap: wrap;
        }

        .browser-btn {
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid var(--ed-input-border);
          background: var(--ed-input-bg);
          color: var(--ed-text);
          border-radius: 12px;
          min-height: 40px;
          padding: 0 14px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 900;
        }

        .browser-btn.primary {
          background: var(--ed-seg-on-bg);
          color: var(--ed-seg-on-txt);
          border-color: transparent;
        }

        .browser-btn.disabled,
        .browser-btn:disabled {
          opacity: 0.45;
          cursor: default;
        }

        .browser-btn .cgc-svg-icon { flex-shrink: 0; }

        .browser-body {
          min-height: 0;
          overflow: auto;
          padding: 14px 18px 18px;
          overscroll-behavior: contain;
        }

        .browser-list {
          display: grid;
          gap: 10px;
        }

        .browser-item {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 10px;
          border-radius: 16px;
          background: var(--ed-row-bg);
          border: 1px solid var(--ed-row-border);
        }

        .browser-open {
          appearance: none;
          -webkit-appearance: none;
          border: 0;
          background: transparent;
          color: var(--ed-text);
          text-align: left;
          min-width: 0;
          padding: 0;
          cursor: pointer;
          display: grid;
          grid-template-columns: 40px minmax(0, 1fr);
          gap: 12px;
          align-items: center;
        }

        .browser-open-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: var(--ed-input-bg);
          border: 1px solid var(--ed-input-border);
        }

        .browser-open-icon .cgc-svg-icon { display: block; }

        .browser-open-copy {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .browser-open-title {
          font-size: 13px;
          font-weight: 950;
          color: var(--ed-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .browser-open-sub {
          font-size: 11px;
          color: var(--ed-text2);
          line-height: 1.35;
          word-break: break-word;
          overflow-wrap: anywhere;
        }

        .browser-select {
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid var(--ed-input-border);
          background: var(--ed-input-bg);
          color: var(--ed-text);
          border-radius: 12px;
          min-height: 38px;
          padding: 0 12px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
        }

        .color-transparent {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 800;
          color: var(--ed-text2);
          cursor: pointer;
        }

        .color-transparent input {
          cursor: pointer;
        }

        .style-sections {
          display: grid;
          gap: 8px;
        }

        .style-section {
          border: 1px solid var(--ed-row-border);
          border-radius: 12px;
          overflow: hidden;
          background: var(--ed-row-bg);
        }
        /* An open search dropdown (.suggestions) is absolutely positioned and
         * floats below its input — the section's overflow:hidden (there to clip
         * rounded corners) would cut it off. Lift the clip only while a
         * dropdown is open so it can spill over the next section. */
        .style-section:has(.suggestions:not([hidden])) {
          overflow: visible;
        }

        .style-section-head {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          cursor: pointer;
          list-style: none;
          font-size: 13px;
          font-weight: 800;
          color: var(--ed-text);
          user-select: none;
        }

        .style-section-head::-webkit-details-marker { display: none; }

        .style-section-head .cgc-svg-icon:first-child {
          color: var(--ed-text2);
          flex: 0 0 auto;
        }

        .style-section-head > span:not(.style-chevron) {
          flex: 1 1 auto;
        }

        .style-chevron {
          color: var(--ed-text2);
          flex: 0 0 auto;
          margin-left: auto;
          transition: transform 0.2s ease;
          display: flex;
          align-items: center;
        }

        details[open] .style-chevron {
          transform: rotate(180deg);
        }

        .style-section-body {
          padding: 4px 14px 14px;
          border-top: 1px solid var(--ed-row-border);
        }

        .radius-range {
          width: 90px;
          cursor: pointer;
          accent-color: var(--primary-color, #03a9f4);
        }

        .radius-value-wrap {
          display: inline-flex;
          align-items: baseline;
          gap: 0;
          font-size: 12px;
          font-weight: 800;
          color: var(--ed-text2);
        }
        .radius-value-input {
          width: 48px;
          padding: 2px 4px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 4px;
          color: inherit;
          font: inherit;
          text-align: right;
          -moz-appearance: textfield;
        }
        .radius-value-input::-webkit-outer-spin-button,
        .radius-value-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .radius-value-input:hover { border-color: var(--ed-divider, rgba(255,255,255,0.10)); }
        .radius-value-input:focus {
          outline: none;
          border-color: var(--primary-color, #03a9f4);
          background: rgba(255,255,255,0.04);
        }
        .radius-value-unit {
          opacity: 0.7;
        }

        .browser-empty {
          display: grid;
          place-items: center;
          min-height: 180px;
          font-size: 13px;
          font-weight: 800;
          color: var(--ed-text2);
          text-align: center;
          padding: 20px;
        }

        @media (max-width: 900px) {
          .tabbar {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .row-head {
            align-items: stretch;
            flex-direction: column;
          }

          .togrow {
            justify-content: space-between;
            width: 100%;
          }

          .browser-modal {
            width: min(96vw, 760px);
            max-height: min(88vh, 760px);
          }

          .browser-item {
            grid-template-columns: 1fr;
          }

          .browser-select {
            width: 100%;
          }


        }

        .cgc-wizard { margin-top: 8px; }
        .cgc-wizard-toggle {
          width: 100%; text-align: left; background: none;
          border: 1px dashed var(--divider-color, #555);
          color: var(--secondary-text-color); border-radius: 6px;
          padding: 5px 10px; cursor: pointer; font-size: 12px;
        }
        .cgc-wizard-toggle:hover { border-color: var(--primary-color); color: var(--primary-color); }
        .cgc-wizard-body { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
        .cgc-wizard-row { display: flex; flex-direction: column; gap: 2px; }
        .cgc-wizard-row label { font-size: 12px; font-weight: 500; }
        .cgc-wizard-prefix { font-size: 13px; color: var(--ed-text); white-space: nowrap; }
        .cgc-wizard-folder-row { display: flex; align-items: center; gap: 4px; }
        .ed-input {
          flex: 1;
          height: 36px;
          padding: 0 10px;
          box-sizing: border-box;
          font-size: 13px;
          font-family: inherit;
          font-weight: 800;
          color: var(--ed-text);
          background: var(--ed-input-bg);
          border: 1px solid var(--ed-input-border);
          border-radius: var(--ed-radius-input);
          outline: none;
          width: 100%;
          transition: border-color 0.16s ease, box-shadow 0.16s ease;
          box-shadow: var(--ed-section-glow);
        }
        .ed-input:focus { border-color: color-mix(in srgb, var(--ed-input-border) 25%, var(--primary-color, #03a9f4) 75%); box-shadow: 0 0 0 3px var(--ed-focus-ring), var(--ed-section-glow); }
        /* Path-format auto-detect status + scoreboard. The status line
         * sits under the Detect button; the expandable shows every
         * candidate the detector tested with its match count, so users
         * can see *why* a particular format won (or didn't). */
        #detect-pathfmt-status {
          display: block;
          margin-top: 8px;
          font-size: 11px;
          color: var(--secondary-text-color, rgba(0,0,0,0.6));
          min-height: 14px;
        }
        .pathfmt-details {
          margin-top: 8px;
          font-size: 11px;
        }
        .pathfmt-details > summary {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          color: var(--primary-color, #03a9f4);
          font-weight: 700;
          list-style: none;
          padding: 4px 2px;
          user-select: none;
        }
        .pathfmt-details > summary::-webkit-details-marker { display: none; }
        .pathfmt-details > summary svg {
          transition: transform 0.15s ease;
        }
        .pathfmt-details[open] > summary svg {
          transform: rotate(90deg);
        }
        .pathfmt-rows {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-top: 6px;
          padding: 6px;
          background: var(--ed-input-bg);
          border: 1px solid var(--ed-input-border);
          border-radius: var(--ed-radius-input);
          max-height: 320px;
          overflow-y: auto;
        }
        .pathfmt-row {
          display: grid;
          grid-template-columns: 1fr auto 60px;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          font-size: 11px;
          font-weight: 600;
          color: var(--ed-text);
          background: transparent;
          border: 1px solid transparent;
          border-radius: 4px;
          cursor: pointer;
          text-align: left;
          transition: background 0.12s ease, border-color 0.12s ease;
        }
        .pathfmt-row:hover {
          background: var(--secondary-background-color, rgba(0,0,0,0.04));
        }
        .pathfmt-row.no-match {
          color: var(--secondary-text-color, rgba(0,0,0,0.45));
        }
        .pathfmt-row.winner {
          background: color-mix(in srgb, var(--primary-color, #03a9f4) 10%, transparent);
          border-color: color-mix(in srgb, var(--primary-color, #03a9f4) 30%, transparent);
        }
        .pathfmt-row.current {
          border-color: var(--primary-color, #03a9f4);
        }
        .pathfmt-row-fmt {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pathfmt-row-count {
          font-variant-numeric: tabular-nums;
          color: var(--secondary-text-color, rgba(0,0,0,0.55));
          min-width: 36px;
          text-align: right;
        }
        .pathfmt-row.matched .pathfmt-row-count {
          color: var(--primary-text-color, rgba(0,0,0,0.85));
        }
        .pathfmt-row-bar {
          display: block;
          height: 4px;
          width: 100%;
          background: color-mix(in srgb, var(--ed-input-border) 50%, transparent);
          border-radius: 2px;
          overflow: hidden;
        }
        .pathfmt-row-bar > span {
          display: block;
          height: 100%;
          background: var(--primary-color, #03a9f4);
          transition: width 0.2s ease;
        }
        .pathfmt-row.no-match .pathfmt-row-bar > span {
          background: transparent;
        }
details summary { user-select: none; }
        .ed-input-row { display: flex; align-items: center; gap: 6px; }
        .ed-suffix { font-size: 12px; color: var(--ed-text2); white-space: nowrap; }
        .cgc-wizard-btn {
          background: var(--primary-color); color: white;
          border: none; border-radius: 6px; padding: 6px 14px;
          cursor: pointer; font-size: 13px; align-self: flex-start;
        }
        .cgc-wizard-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .cgc-wizard-link {
          font-size: 11px; color: var(--primary-color, #03a9f4);
          text-decoration: none; opacity: 0.75; margin-left: 6px;
        }
        .cgc-wizard-link:hover { opacity: 1; text-decoration: underline; }
        .cgc-wizard-success {
          font-size: 12px; color: var(--success-color, #4caf50);
          background: rgba(76,175,80,0.1); border-radius: 6px; padding: 8px;
        }
        .cgc-wizard-error {
          font-size: 12px; color: var(--error-color, #f44336);
          background: rgba(244,67,54,0.1); border-radius: 6px; padding: 8px;
        }
        .cgc-inline-warn {
          font-size: 11.5px; color: var(--ed-warning, rgba(245,158,11,0.95));
          background: var(--ed-warning-bg); border: 1px solid var(--ed-warning-border);
          border-radius: 6px; padding: 6px 8px; margin-top: 6px;
          display: flex; align-items: flex-start; gap: 6px;
        }
        .cgc-inline-warn .cgc-svg-icon { flex-shrink: 0; margin-top: 1px; }
`;
