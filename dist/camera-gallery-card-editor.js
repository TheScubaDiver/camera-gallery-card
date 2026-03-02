/* camera-gallery-card-editor.js
 * v1.0.1
 */

console.warn("CAMERA GALLERY EDITOR LOADED v1.0.1");

class CameraGalleryCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this.attachShadow({ mode: "open" });

    this._raf = null;

    // media source dropdown cache
    this._mediaFolders = null; // array of "local/frigate" style folder paths
    this._mediaFoldersLoading = false;

    // ✅ keep section open/close state across renders
    // ✅ DEFAULT: only General open; the rest closed
    this._secOpen = {
      "sec-general": true,
      "sec-viewer": false,
      "sec-thumbs": false,
      "sec-tsbar": false,
    };
  }

  _scheduleRender() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this._render());
  }

  _stripAlwaysTrueKeys(cfg) {
    const next = { ...(cfg || {}) };

    // ✅ this option is ALWAYS true in the card and should never be stored in config
    if ("preview_close_on_tap" in next) delete next.preview_close_on_tap;

    return next;
  }

  set hass(hass) {
    this._hass = hass;

    // ✅ if user is interacting with inputs/selects, don't re-render (prevents dropdown closing)
    const ae = this.shadowRoot?.activeElement;
    const interacting =
      ae &&
      (ae.id === "entity" ||
        ae.id === "mediasource" ||
        ae.id === "delservice" ||
        ae.id === "height" ||
        ae.id === "thumb" ||
        ae.id === "barop") &&
      ae.matches(":focus");

    if (interacting) return;

    // ✅ load media folders once
    if (!this._mediaFolders && !this._mediaFoldersLoading) {
      this._loadMediaFolders();
    }

    // ✅ throttle renders
    this._scheduleRender();
  }

  setConfig(config) {
    // ✅ strip keys we never want persisted/shown in YAML
    this._config = this._stripAlwaysTrueKeys({ ...(config || {}) });

    // legacy cleanup (also on load)
    if ("shell_command" in this._config) {
      // keep reading legacy elsewhere, but don't keep it in config
      const next = { ...this._config };
      delete next.shell_command;
      this._config = next;
    }

    this._scheduleRender();
  }

  _fire() {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: { ...this._config } },
        bubbles: true,
        composed: true,
      })
    );
  }

  _set(key, value) {
    // ✅ never allow this key to exist in config (prevents YAML showing it)
    if (key === "preview_close_on_tap") {
      // silently ignore
      return;
    }

    this._config = { ...this._config, [key]: value };

    // ✅ always strip keys that should never be stored
    this._config = this._stripAlwaysTrueKeys(this._config);

    // legacy cleanup always
    if (key !== "shell_command" && "shell_command" in this._config) {
      const next = { ...this._config };
      delete next.shell_command;
      this._config = next;
    }

    this._fire();
    this._scheduleRender();
  }

  _mergeChoices(list, current) {
    const set = new Set(Array.isArray(list) ? list : []);
    const cur = String(current || "").trim();
    if (cur) set.add(cur);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  _looksLikeFile(relPath) {
    const last = String(relPath || "").split("/").pop() || "";
    return /\.(jpg|jpeg|png|gif|webp|mp4|mov|mkv|avi|m4v|wav|mp3|aac|flac|pdf|txt|json)$/i.test(
      last
    );
  }

  _toRel(media_content_id) {
    return String(media_content_id || "")
      .replace(/^media-source:\/\/media_source\//, "")
      .replace(/^media-source:\/\/media_source/, "")
      .replace(/^media-source:\/\//, "")
      .replace(/^\/+/, "")
      .trim();
  }

  async _loadMediaFolders() {
    if (this._mediaFoldersLoading) return;
    if (!this._hass?.callWS) return;

    this._mediaFoldersLoading = true;

    const browse = async (media_content_id) =>
      await this._hass.callWS({
        type: "media_source/browse_media",
        media_content_id,
      });

    const getChildren = (res) => (Array.isArray(res?.children) ? res.children : []);

    // Strict: accept only folders (or unknown type but NOT file-like)
    const isFolder = (item) => {
      const mc = item?.media_class;
      const mct = item?.media_content_type;

      if (mc) return mc === "directory";
      if (mct) return mct === "directory";

      const rel = this._toRel(item?.media_content_id);
      return !!rel && !this._looksLikeFile(rel);
    };

    try {
      const folderSet = new Set();

      // Try both roots (HA differences)
      let rootRes = null;
      try {
        rootRes = await browse("media-source://media_source");
      } catch (_) {
        rootRes = await browse("media-source://");
      }

      const rootIds = getChildren(rootRes)
        .map((it) => it?.media_content_id)
        .filter(Boolean);

      // Add roots as fallback (local/mac_share/nas...) but only if they don't look like files
      for (const rid of rootIds) {
        const relRoot = this._toRel(rid).replace(/^media_source\//, "");
        if (relRoot && !this._looksLikeFile(relRoot)) folderSet.add(relRoot);
      }

      // Depth 1 + 2 only (prevents mega lists)
      for (const rid of rootIds) {
        let level1 = null;
        try {
          level1 = await browse(rid);
        } catch (_) {
          continue;
        }

        const kids1 = getChildren(level1);

        for (const k1 of kids1) {
          if (!isFolder(k1)) continue;

          const rel1 = this._toRel(k1?.media_content_id).replace(/^media_source\//, "");
          if (rel1 && !this._looksLikeFile(rel1)) folderSet.add(rel1);

          const id2 = k1?.media_content_id;
          if (!id2) continue;

          // depth 2
          try {
            const level2 = await browse(id2);
            const kids2 = getChildren(level2);

            for (const k2 of kids2) {
              if (!isFolder(k2)) continue;

              const rel2 = this._toRel(k2?.media_content_id).replace(
                /^media_source\//,
                ""
              );
              if (rel2 && !this._looksLikeFile(rel2)) folderSet.add(rel2);
            }
          } catch (_) {}
        }
      }

      this._mediaFolders = Array.from(folderSet).sort((a, b) => a.localeCompare(b));
    } catch (e) {
      this._mediaFolders = [];
    } finally {
      this._mediaFoldersLoading = false;
      this._scheduleRender();
    }
  }

  _render() {
    const c = this._config || {};

    // ✅ mutually exclusive mode
    const sourceMode = String(c.source_mode || "sensor"); // "sensor" | "media"
    const sensorModeOn = sourceMode === "sensor";
    const mediaModeOn = sourceMode === "media";

    const fileSensor = String(c.entity || "").trim();

    const sensorOptions = this._hass
      ? Object.values(this._hass.states)
          .filter(
            (e) => e.entity_id.startsWith("sensor.") && e.attributes?.fileList !== undefined
          )
          .map((e) => e.entity_id)
          .sort((a, b) => a.localeCompare(b))
      : [];

    const isSensorDomain = /^sensor\./i.test(fileSensor);
    const entityExists = !!this._hass?.states?.[fileSensor];

    const mediaSource = String(c.media_source || "").trim();
    const mediaLoading = this._mediaFoldersLoading === true;

    const mediaSourceIsFile = this._looksLikeFile(mediaSource);

    // Don't let a file value pollute the dropdown list
    const mediaChoices = this._mergeChoices(
      this._mediaFolders,
      mediaSourceIsFile ? "" : mediaSource
    );

    const height = Number(c.preview_height) || 320;
    const thumbSize = Number(c.thumb_size) || 140;
    const tsPos = String(c.bar_position || "top");

    // ✅ NEW: preview position (top|bottom)
    const previewPos = String(c.preview_position || "top"); // "top" | "bottom"

    // ✅ Delete service options from HA
    const allServices = this._hass?.services || {};
    const shellCmds = Object.keys(allServices.shell_command || {})
      .map((svc) => `shell_command.${svc}`)
      .sort((a, b) => a.localeCompare(b));

    const deleteService = String(c.delete_service || c.shell_command || "").trim();
    const deleteOk = /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(deleteService);

    const deleteChoices = (() => {
      const set = new Set(shellCmds);
      if (deleteService) set.add(deleteService);
      return Array.from(set).sort((a, b) => a.localeCompare(b));
    })();

    // ✅ consistent key: bar_opacity (read + write)
    const barOpacity = (() => {
      const n = Number(c.bar_opacity);
      if (!Number.isFinite(n)) return 45;
      return Math.min(100, Math.max(0, n));
    })();

    const barDisabled = tsPos === "hidden";
    const clickToOpen = c.preview_click_to_open === true;

    const entityChoices = (() => {
      const set = new Set(sensorOptions);
      if (fileSensor) set.add(fileSensor);
      return Array.from(set).sort((a, b) => a.localeCompare(b));
    })();

    const secOpenAttr = (id) => (this._secOpen[id] ? "true" : "false");

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; padding:8px 0; }
        .wrap { display:grid; gap:14px; }

        .section{
          padding:14px;
          border-radius:16px;
          background:rgba(0,0,0,0.08);
          border:1px solid rgba(255,255,255,0.06);
        }

        .shead{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          cursor:pointer;
          user-select:none;
        }

        .stitle{
          display:flex;
          align-items:center;
          gap:10px;
          font-size:16px;
          font-weight:1000;
        }

        .ico{
          width:18px;
          height:18px;
          display:inline-grid;
          place-items:center;
          opacity:0.9;
        }

        .chev{
          width:28px;
          height:28px;
          border-radius:10px;
          border:1px solid rgba(255,255,255,0.10);
          background:rgba(255,255,255,0.06);
          display:grid;
          place-items:center;
          opacity:0.85;
          transition:0.18s ease;
        }

        .chev svg{
          width:14px;
          height:14px;
          transform:rotate(0deg);
          transition:0.18s ease;
        }

        .section[data-open="false"] .chev svg{
          transform:rotate(-90deg);
        }

        .sbody{
          margin-top:12px;
          display:grid;
          gap:12px;
        }

        .section[data-open="false"] .sbody{
          display:none;
        }

        .row {
          display:grid;
          gap:8px;
          padding:14px;
          border-radius:14px;
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.06);
        }

        .lbl { font-size:13px; font-weight:900; }
        .desc { font-size:12px; opacity:0.7; }

        .input {
          width:100%;
          box-sizing:border-box;
          border-radius:10px;
          border:1px solid rgba(255,255,255,0.08);
          background:rgba(255,255,255,0.06);
          color:inherit;
          padding:10px 12px;
          font-size:13px;
          font-weight:800;
          outline:none;
        }

        .input.invalid{
          border-color: rgba(255, 77, 77, 0.85);
          box-shadow: 0 0 0 2px rgba(255, 77, 77, 0.18);
        }

        .segwrap { display:flex; gap:8px; }
        .seg {
          flex:1;
          border:1px solid rgba(255,255,255,0.10);
          background:rgba(255,255,255,0.06);
          color:rgba(255,255,255,0.78);
          border-radius:10px;
          padding:10px 0;
          font-size:13px;
          font-weight:800;
          cursor:pointer;
        }
        .seg.on {
          background:#ffffff;
          color:rgba(0,0,0,0.95);
          border-color:transparent;
        }

        /* custom dropdown wrapper + arrow */
        .selectwrap{ position:relative; }
        select.select{
          appearance:none;
          -webkit-appearance:none;
          padding-right:44px; /* space for arrow */
          cursor:pointer;
        }
        .selarrow{
          position:absolute;
          top:50%;
          right:20px; /* bigger = more to the left */
          width:10px;
          height:10px;
          transform:translateY(-50%) rotate(45deg);
          border-right:2px solid rgba(255,255,255,0.85);
          border-bottom:2px solid rgba(255,255,255,0.85);
          pointer-events:none;
          opacity:0.9;
        }

        .togrow{
          display:flex;
          align-items:center;
          justify-content:space-between;
        }

        .toggle{
          appearance:none;
          -webkit-appearance:none;
          width:46px;
          height:28px;
          border-radius:999px;
          position:relative;
          border:1px solid rgba(255,255,255,0.12);
          background:rgba(255,255,255,0.08);
          cursor:pointer;
        }

        .toggle::after{
          content:"";
          position:absolute;
          top:3px;
          left:3px;
          width:22px;
          height:22px;
          border-radius:999px;
          background:rgba(255,255,255,0.92);
          transition:0.18s ease;
        }

        .toggle:checked{
          background:#ffffff;
          border-color:transparent;
        }

        .toggle:checked::after{
          transform:translateX(18px);
          background:rgba(0,0,0,0.92);
        }

        .barrow{
          display:flex;
          align-items:center;
          gap:12px;
        }

        .hint {
          margin: 6px 0 10px 0;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          opacity: 0.85;
        }

        .hint ha-icon {
          --mdc-icon-size: 14px;
          color: var(--secondary-text-color);
        }

        .hint a {
          color: var(--primary-color);
          text-decoration: none;
          font-weight: 500;
        }

        .hint a:hover {
          text-decoration: underline;
        }

        .slider { width:100%; accent-color:#ffffff; }
        .pillval{
          min-width:52px;
          text-align:center;
          padding:6px 10px;
          border-radius:999px;
          background:rgba(255,255,255,0.10);
          border:1px solid rgba(255,255,255,0.10);
          font-size:12px;
          font-weight:1000;
        }

        .muted{
          opacity:0.55;
          pointer-events:none;
        }
      </style>

      <div class="wrap">

        <!-- GENERAL -->
        <div class="section" id="sec-general" data-open="${secOpenAttr("sec-general")}">
          <div class="shead" data-toggle="sec-general">
            <div class="stitle">
              <span class="ico">⚙️</span>
              <span>General</span>
            </div>
            <div class="chev" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M8 10l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>

          <div class="sbody">

            <div class="row">
              <div class="lbl">Source mode</div>
              <div class="desc">Choose how this gallery loads its files</div>
              <div class="segwrap">
                <button class="seg ${sensorModeOn ? "on" : ""}" data-src="sensor">File sensor</button>
                <button class="seg ${mediaModeOn ? "on" : ""}" data-src="media">Media folder</button>
              </div>
            </div>

            <div class="row ${sensorModeOn ? "" : "muted"}">
              <div class="lbl">File sensor</div>
              <div class="desc">Sensor entity that contains the <code>fileList</code> attribute</div>

              <div class="selectwrap">
                <select class="input select ${fileSensor && (!isSensorDomain || !entityExists) ? "invalid" : ""}" id="entity" ${sensorModeOn ? "" : "disabled"}>
                  ${
                    entityChoices.length
                      ? entityChoices
                          .map(
                            (id) =>
                              `<option value="${id}" ${
                                id === fileSensor ? "selected" : ""
                              }>${id}</option>`
                          )
                          .join("")
                      : `<option value="" selected>(no sensors found)</option>`
                  }
                </select>
                <span class="selarrow"></span>
              </div>
            </div>

            <div class="row ${mediaModeOn ? "" : "muted"}">
              <div class="lbl">Media source</div>
              <div class="desc">Choose the media folder that contains your recordings or snapshots</div>

              <div class="selectwrap">
                <select class="input select ${mediaSourceIsFile ? "invalid" : ""}" id="mediasource" ${mediaModeOn ? "" : "disabled"}>
                  ${
                    mediaSourceIsFile
                      ? `<option value="${mediaSource}" selected>⚠️ ${mediaSource} (file — choose a folder)</option>`
                      : ""
                  }
                  ${
                    mediaLoading
                      ? `<option value="${mediaSource}" selected>(loading…)</option>`
                      : mediaChoices.length
                        ? mediaChoices
                            .map(
                              (p) =>
                                `<option value="${p}" ${
                                  p === mediaSource ? "selected" : ""
                                }>${p}</option>`
                            )
                            .join("")
                        : `<option value="${mediaSource}" selected>(no folders found)</option>`
                  }
                </select>
                <span class="selarrow"></span>
              </div>
            </div>

            <div class="row">
              <div class="lbl">Delete service</div>

              <div class="desc">
                Select the Home Assistant service used to delete a file
                (usually <code>shell_command.*</code>)
              </div>

              <div class="hint">
                <ha-icon icon="mdi:help-circle-outline"></ha-icon>
                <a
                  href="https://github.com/TheScubadiver/camera-gallery-card?tab=readme-ov-file#delete-setup"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  How to configure the shell command
                </a>
              </div>

              <div class="selectwrap">
                <select class="input select ${deleteOk ? "" : "invalid"}" id="delservice">
                  ${
                    deleteChoices.length
                      ? deleteChoices
                          .map(
                            (id) =>
                              `<option value="${id}" ${
                                id === deleteService ? "selected" : ""
                              }>${id}</option>`
                          )
                          .join("")
                      : `<option value="" selected>(no shell_command services found)</option>`
                  }
                </select>
                <span class="selarrow"></span>
              </div>
            </div>

          </div>
        </div>

        <!-- MAIN VIEWER -->
        <div class="section" id="sec-viewer" data-open="${secOpenAttr("sec-viewer")}">
          <div class="shead" data-toggle="sec-viewer">
            <div class="stitle">
              <span class="ico">🖼️</span>
              <span>Main viewer</span>
            </div>
            <div class="chev" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M8 10l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>

          <div class="sbody">
            <div class="row">
              <div class="lbl">Viewer height</div>
              <div class="desc">Height of the main image/video viewer (px)</div>
              <input class="input" id="height" type="number" value="${height}" />
            </div>

            <div class="row">
              <div class="lbl">Preview position</div>
              <div class="desc">Show the main viewer above or below the thumbnails</div>
              <div class="segwrap">
                <button class="seg ${previewPos === "top" ? "on" : ""}" data-ppos="top">Top</button>
                <button class="seg ${previewPos === "bottom" ? "on" : ""}" data-ppos="bottom">Bottom</button>
              </div>
            </div>

            <div class="row">
              <div class="lbl">Open on thumbnail click</div>
              <div class="desc">Only show the main viewer after selecting a thumbnail. Click on the preview to close</div>
              <div class="togrow">
                <span>${clickToOpen ? "Enabled" : "Disabled"}</span>
                <input class="toggle" id="clicktoopen" type="checkbox" ${
                  clickToOpen ? "checked" : ""
                }/>
              </div>
            </div>
          </div>
        </div>

        <!-- THUMBNAILS -->
        <div class="section" id="sec-thumbs" data-open="${secOpenAttr("sec-thumbs")}">
          <div class="shead" data-toggle="sec-thumbs">
            <div class="stitle">
              <span class="ico">🧩</span>
              <span>Thumbnails</span>
            </div>
            <div class="chev" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M8 10l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>

          <div class="sbody">
            <div class="row">
              <div class="lbl">Thumbnail size</div>
              <div class="desc">Size of each thumbnail (px)</div>
              <input class="input" id="thumb" type="number" value="${thumbSize}" />
            </div>
          </div>
        </div>

        <!-- TIMESTAMP BAR -->
        <div class="section" id="sec-tsbar" data-open="${secOpenAttr("sec-tsbar")}">
          <div class="shead" data-toggle="sec-tsbar">
            <div class="stitle">
              <span class="ico">🕒</span>
              <span>Timestamp bar</span>
            </div>
            <div class="chev" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M8 10l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>

          <div class="sbody">
            <div class="row">
              <div class="lbl">Timestamp bar position</div>
              <div class="segwrap">
                <button class="seg ${tsPos === "top" ? "on" : ""}" data-pos="top">Top</button>
                <button class="seg ${tsPos === "bottom" ? "on" : ""}" data-pos="bottom">Bottom</button>
                <button class="seg ${tsPos === "hidden" ? "on" : ""}" data-pos="hidden">Hidden</button>
              </div>
            </div>

            <div class="row ${barDisabled ? "muted" : ""}">
              <div class="lbl">Bar opacity</div>
              <div class="desc">Opacity of the timestamp bar (0–100)</div>
              <div class="barrow">
                <input class="slider" id="barop" type="range" min="0" max="100" value="${barOpacity}" ${
      barDisabled ? "disabled" : ""
    }/>
                <div class="pillval" id="barval">${barOpacity}%</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;

    const $ = (id) => this.shadowRoot.getElementById(id);

    // section toggles
    this.shadowRoot.querySelectorAll("[data-toggle]").forEach((h) => {
      h.addEventListener("click", () => {
        const id = h.getAttribute("data-toggle");
        const sec = this.shadowRoot.getElementById(id);
        if (!sec) return;

        const open = sec.getAttribute("data-open") !== "false";
        const next = !open;

        sec.setAttribute("data-open", next ? "true" : "false");
        this._secOpen[id] = next; // ✅ persist
      });
    });

    // source mode buttons
    this.shadowRoot.querySelectorAll("[data-src]").forEach((btn) => {
      btn.addEventListener("click", () => this._set("source_mode", btn.dataset.src));
    });

    $("entity")?.addEventListener("change", (e) =>
      this._set("entity", String(e.target.value || "").trim())
    );

    $("mediasource")?.addEventListener("change", (e) =>
      this._set("media_source", String(e.target.value || "").trim())
    );

    $("delservice")?.addEventListener("change", (e) => {
      const v = String(e.target.value || "").trim();
      if (!v) {
        const next = { ...this._config };
        delete next.delete_service;

        // ✅ also ensure this never persists
        delete next.preview_close_on_tap;

        this._config = next;
        this._fire();
        this._scheduleRender();
        return;
      }
      this._set("delete_service", v);
    });

    $("height")?.addEventListener("change", (e) =>
      this._set("preview_height", Number(e.target.value) || 320)
    );

    // ✅ NEW: preview position segmented buttons
    this.shadowRoot.querySelectorAll(".seg[data-ppos]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("preview_position", btn.dataset.ppos)
      );
    });

    $("thumb")?.addEventListener("change", (e) =>
      this._set("thumb_size", Number(e.target.value) || 140)
    );

    $("clicktoopen")?.addEventListener("change", (e) => {
      const on = !!e.target.checked;

      // ✅ user-visible toggle stays in YAML
      this._set("preview_click_to_open", on);

      // ✅ close-on-tap is ALWAYS true, but is NOT stored/shown in YAML anymore.
      // The card should enforce it internally.
    });

    // timestamp position segmented buttons
    this.shadowRoot.querySelectorAll(".seg[data-pos]").forEach((btn) => {
      btn.addEventListener("click", () => this._set("bar_position", btn.dataset.pos));
    });

    // bar opacity live update
    const barop = $("barop");
    const barval = $("barval");
    barop?.addEventListener("input", (e) => {
      const v = Number(e.target.value);
      if (barval) barval.textContent = `${v}%`;
    });
    barop?.addEventListener("change", (e) => {
      const v = Number(e.target.value);
      // ✅ consistent key: bar_opacity
      this._set("bar_opacity", Number.isFinite(v) ? v : 45);
    });
  }
}

if (!customElements.get("camera-gallery-card-editor")) {
  customElements.define("camera-gallery-card-editor", CameraGalleryCardEditor);
}

console.info("CAMERA GALLERY EDITOR: registered OK");
