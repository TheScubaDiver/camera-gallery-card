/* camera-gallery-card-editor.js
 * v1.1.0
 */

console.warn("CAMERA GALLERY EDITOR LOADED v1.1.0");

class CameraGalleryCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this.attachShadow({ mode: "open" });

    this._favScrollTop = 0;
    this._favWasOpen = false;

    this._raf = null;

    // media source dropdown cache
    this._mediaFolders = null; // array of folder choices (strings)
    this._mediaFoldersLoading = false;

    // keep section open/close state across renders
    this._secOpen = {
      "sec-general": true,
      "sec-viewer": false,
      "sec-thumbs": false,
      "sec-tsbar": false,
    };

    // compact checkbox picker UI state
    this._favPickerOpen = false;
    this._favQuery = "";

    // ✅ focus restore state
    this._focusState = null;
  }

  _scheduleRender() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this._render());
  }

  _stripAlwaysTrueKeys(cfg) {
    const next = { ...(cfg || {}) };

    // this option is ALWAYS true in the card and should never be stored in config
    if ("preview_close_on_tap" in next) delete next.preview_close_on_tap;

    // legacy/old keys - ensure YAML stays clean
    if ("filter_folders_enabled" in next) delete next.filter_folders_enabled;
    if ("media_folder_filter" in next) delete next.media_folder_filter;
    if ("media_folder_favorites" in next) delete next.media_folder_favorites;

    return next;
  }

  // ─── Light/dark detection ──────────────────────────────────────────
  _parseCssColorToRgb(v) {
    const s = String(v || "").trim().toLowerCase();
    if (!s) return null;

    const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };

    if (s.startsWith("#")) {
      const hex = s.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        return { r, g, b };
      }
      if (hex.length >= 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return { r, g, b };
      }
    }
    return null;
  }

  _luminance({ r, g, b }) {
    const srgb = [r, g, b].map((x) => {
      x = x / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }

  _isLightTheme() {
    try {
      const cs = getComputedStyle(this);
      const bg =
        cs.getPropertyValue("--primary-background-color") ||
        cs.getPropertyValue("--lovelace-background") ||
        cs.backgroundColor ||
        "";
      const rgb = this._parseCssColorToRgb(bg);
      if (!rgb) return false;
      return this._luminance(rgb) > 0.6;
    } catch (_) {
      return false;
    }
  }

  set hass(hass) {
    this._hass = hass;

    // if user is interacting with inputs/selects, don't re-render (prevents dropdown closing)
    const ae = this.shadowRoot?.activeElement;
    const interacting =
      ae &&
      (ae.id === "entity" ||
        ae.id === "mediasource" ||
        ae.id === "delservice" ||
        ae.id === "height" ||
        ae.id === "thumb" ||
        ae.id === "maxmedia" ||
        ae.id === "barop" ||
        ae.id === "favquery") &&
      ae.matches(":focus");

    if (interacting) return;

    // load media folders once
    if (!this._mediaFolders && !this._mediaFoldersLoading) {
      this._loadMediaFolders();
    }

    this._scheduleRender();
  }

  setConfig(config) {
    this._config = this._stripAlwaysTrueKeys({ ...(config || {}) });

    // legacy cleanup (also on load)
    if ("shell_command" in this._config) {
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
    // never allow this key to exist in config (prevents YAML showing it)
    if (key === "preview_close_on_tap") return;

    this._config = { ...this._config, [key]: value };
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
    const v = String(relPath || "");
    if (v.startsWith("media-source://")) return false;

    const last = v.split("/").pop() || "";
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

  _prettyLabel(choiceValue) {
    const v = String(choiceValue || "");
    if (!v) return "";
    if (v.startsWith("media-source://")) return this._toRel(v);
    return v;
  }

  _numInt(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.round(n);
  }

  _clampInt(n, min, max) {
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.round(n)));
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

    const getChildren = (res) =>
      Array.isArray(res?.children) ? res.children : [];

    const isFolder = (item) => {
      const mc = item?.media_class;
      const mct = item?.media_content_type;

      if (mc) return mc === "directory";
      if (mct) return mct === "directory";

      const rel = this._toRel(item?.media_content_id);
      return !!rel && !this._looksLikeFile(rel);
    };

    const normStoreValue = (media_content_id) => {
      const id = String(media_content_id || "").trim();
      if (!id) return "";

      if (id.startsWith("media-source://media_source/")) {
        const rel = this._toRel(id).replace(/^media_source\//, "");
        return rel;
      }

      if (id.startsWith("media-source://")) return id;

      return id;
    };

    const shouldSkip = (media_content_id) => {
      const store = normStoreValue(media_content_id);
      const label = this._prettyLabel(store);
      return label === "radio_browser" || label.startsWith("radio_browser/");
    };

    try {
      const folderSet = new Set();

      const rootIds = [];
      for (const root of ["media-source://media_source", "media-source://"]) {
        try {
          const rootRes = await browse(root);
          const ids = getChildren(rootRes)
            .map((it) => it?.media_content_id)
            .filter(Boolean);
          rootIds.push(...ids);
        } catch (_) {}
      }

      const uniqRootIds = Array.from(new Set(rootIds)).filter(
        (rid) => !shouldSkip(rid)
      );

      for (const rid of uniqRootIds) {
        if (shouldSkip(rid)) continue;

        const store = normStoreValue(rid);
        const label = this._prettyLabel(store);
        if (label && !this._looksLikeFile(label)) folderSet.add(store);
      }

      for (const rid of uniqRootIds) {
        if (shouldSkip(rid)) continue;

        let level1 = null;
        try {
          level1 = await browse(rid);
        } catch (_) {
          continue;
        }

        const kids1 = getChildren(level1);

        for (const k1 of kids1) {
          if (!isFolder(k1)) continue;
          if (shouldSkip(k1?.media_content_id)) continue;

          const id1 = k1?.media_content_id;
          const store1 = normStoreValue(id1);
          const label1 = this._prettyLabel(store1);
          if (label1 && !this._looksLikeFile(label1)) folderSet.add(store1);

          if (!id1) continue;

          try {
            const level2 = await browse(id1);
            const kids2 = getChildren(level2);

            for (const k2 of kids2) {
              if (!isFolder(k2)) continue;
              if (shouldSkip(k2?.media_content_id)) continue;

              const id2 = k2?.media_content_id;
              const store2 = normStoreValue(id2);
              const label2 = this._prettyLabel(store2);
              if (label2 && !this._looksLikeFile(label2)) folderSet.add(store2);
            }
          } catch (_) {}
        }
      }

      this._mediaFolders = Array.from(folderSet).sort((a, b) => {
        const aa = this._prettyLabel(a);
        const bb = this._prettyLabel(b);

        const aLocal = aa === "local" || aa.startsWith("local/");
        const bLocal = bb === "local" || bb.startsWith("local/");
        if (aLocal && !bLocal) return -1;
        if (!aLocal && bLocal) return 1;

        return aa.localeCompare(bb, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      });
    } catch (e) {
      this._mediaFolders = [];
    } finally {
      this._mediaFoldersLoading = false;
      this._scheduleRender();
    }
  }

  _prettyMediaFolderLabel(p) {
    const key = String(p || "")
      .replace(/\/+$/g, "")
      .toLowerCase();

    const parts = key.split("/").filter(Boolean);
    const last = parts.pop() || "";

    // Special Frigate cases
    if (last === "clips") return "Clips";
    if (last === "snapshots") return "Snapshots";
    if (last === "event-search") return "Event Search";

    return last
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // ✅ ONE favorites key (array): media_folders_fav
  _getFavFolders() {
    const raw = this._config?.media_folders_fav;
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map(String).map((s) => s.trim()).filter(Boolean);
    }
    // fallback if someone stored as string
    return String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  _setFavFolders(nextArray) {
    const cleaned = Array.from(
      new Set((nextArray || []).map((x) => String(x).trim()).filter(Boolean))
    );

    if (!cleaned.length) {
      const next = { ...this._config };
      delete next.media_folders_fav; // keep YAML clean
      this._config = next;
      this._fire();
      this._scheduleRender();
      return;
    }

    this._set("media_folders_fav", cleaned);
  }

  _toggleFavPicker(open) {
    this._favPickerOpen =
      typeof open === "boolean" ? open : !this._favPickerOpen;
    this._scheduleRender();
  }

  _render() {
    const c = this._config || {};

    // ✅ SAVE focus + caret BEFORE nuking innerHTML
    try {
      const ae = this.shadowRoot?.activeElement;
      if (ae && ae.id) {
        const st =
          typeof ae.selectionStart === "number" ? ae.selectionStart : null;
        const en = typeof ae.selectionEnd === "number" ? ae.selectionEnd : null;
        this._focusState = {
          id: ae.id,
          // keep a copy of typed value for safety
          value: typeof ae.value === "string" ? ae.value : null,
          start: st,
          end: en,
        };
      } else {
        this._focusState = null;
      }
    } catch (_) {
      this._focusState = null;
    }

    const sourceMode = String(c.source_mode || "sensor");
    const sensorModeOn = sourceMode === "sensor";
    const mediaModeOn = sourceMode === "media";

    const fileSensor = String(c.entity || "").trim();

    const sensorOptions = this._hass
      ? Object.values(this._hass.states)
          .filter(
            (e) =>
              e.entity_id.startsWith("sensor.") &&
              e.attributes?.fileList !== undefined
          )
          .map((e) => e.entity_id)
          .sort((a, b) => a.localeCompare(b))
      : [];

    const isSensorDomain = /^sensor\./i.test(fileSensor);
    const entityExists = !!this._hass?.states?.[fileSensor];

    const mediaSource = String(c.media_source || "").trim();
    const mediaLoading = this._mediaFoldersLoading === true;

    const mediaSourceIsFile =
      !mediaSource.startsWith("media-source://") &&
      this._looksLikeFile(mediaSource);

    const baseList = Array.isArray(this._mediaFolders) ? this._mediaFolders : [];
    const favs = this._getFavFolders();

    // dropdown shows ONLY favorites if favorites exist; otherwise show all
    const listForDropdown = favs.length
      ? baseList.filter((p) => favs.includes(p))
      : baseList;

    const mediaChoices = this._mergeChoices(
      listForDropdown,
      mediaSourceIsFile ? "" : mediaSource
    );

    const height = Number(c.preview_height) || 320;
    const thumbSize = Number(c.thumb_size) || 140;

    const maxMedia = (() => {
      const n = this._numInt(c.max_media, 200);
      return this._clampInt(n, 1, 2000);
    })();

    const tsPos = String(c.bar_position || "top");
    const previewPos = String(c.preview_position || "top");

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

    // Theme-aware palette
    const isLight = this._isLightTheme();

    const dark = {
      sectionBg: "rgba(0,0,0,0.08)",
      sectionBorder: "rgba(255,255,255,0.06)",
      rowBg: "rgba(255,255,255,0.04)",
      rowBorder: "rgba(255,255,255,0.06)",
      text: "rgba(255,255,255,0.92)",
      text2: "rgba(255,255,255,0.72)",
      inputBg: "rgba(255,255,255,0.06)",
      inputBorder: "rgba(255,255,255,0.08)",
      chevronBg: "rgba(255,255,255,0.06)",
      chevronBorder: "rgba(255,255,255,0.10)",
      segBg: "rgba(255,255,255,0.06)",
      segBorder: "rgba(255,255,255,0.10)",
      segTxt: "rgba(255,255,255,0.78)",
      segOnBg: "#ffffff",
      segOnTxt: "rgba(0,0,0,0.95)",
      arrow: "rgba(255,255,255,0.85)",
      pillBg: "rgba(255,255,255,0.10)",
      pillBorder: "rgba(255,255,255,0.10)",
      muted: "0.55",
      invalid: "rgba(255, 77, 77, 0.85)",
      invalidGlow: "rgba(255, 77, 77, 0.18)",
      popBg: "rgba(20, 20, 24, 0.94)",
      popBorder: "rgba(255,255,255,0.14)",
      popShadow1: "rgba(0,0,0,0.55)",
      popShadow2: "rgba(0,0,0,0.25)",
      pillTxt: "rgba(255,255,255,0.92)",
    };

    const lightPal = {
      sectionBg: "rgba(0,0,0,0.03)",
      sectionBorder: "rgba(0,0,0,0.08)",
      rowBg: "rgba(0,0,0,0.04)",
      rowBorder: "rgba(0,0,0,0.08)",
      text: "rgba(0,0,0,0.88)",
      text2: "rgba(0,0,0,0.62)",
      inputBg: "rgba(0,0,0,0.03)",
      inputBorder: "rgba(0,0,0,0.12)",
      chevronBg: "rgba(0,0,0,0.04)",
      chevronBorder: "rgba(0,0,0,0.12)",
      segBg: "rgba(0,0,0,0.05)",
      segBorder: "rgba(0,0,0,0.10)",
      segTxt: "rgba(0,0,0,0.68)",
      segOnBg: "rgba(0,0,0,0.88)",
      segOnTxt: "rgba(255,255,255,0.98)",
      arrow: "rgba(0,0,0,0.60)",
      pillBg: "rgba(0,0,0,0.06)",
      pillBorder: "rgba(0,0,0,0.10)",
      muted: "0.65",
      invalid: "rgba(219, 68, 55, 0.85)",
      invalidGlow: "rgba(219, 68, 55, 0.18)",
      popBg: "rgba(255,255,255,0.96)",
      popBorder: "rgba(0,0,0,0.14)",
      popShadow1: "rgba(0,0,0,0.18)",
      popShadow2: "rgba(0,0,0,0.10)",
      pillTxt: "rgba(255,255,255,0.98)",
      pillBg: "rgba(0,0,0,0.55)",
      pillBorder: "rgba(0,0,0,0.18)",
    };

    const p = isLight ? lightPal : dark;

    const rootVars = `
      --ed-section-bg:${p.sectionBg};
      --ed-section-border:${p.sectionBorder};
      --ed-row-bg:${p.rowBg};
      --ed-row-border:${p.rowBorder};

      --ed-text:${p.text};
      --ed-text2:${p.text2};

      --ed-input-bg:${p.inputBg};
      --ed-input-border:${p.inputBorder};

      --ed-chev-bg:${p.chevronBg};
      --ed-chev-border:${p.chevronBorder};

      --ed-seg-bg:${p.segBg};
      --ed-seg-border:${p.segBorder};
      --ed-seg-txt:${p.segTxt};
      --ed-seg-on-bg:${p.segOnBg};
      --ed-seg-on-txt:${p.segOnTxt};

      --ed-arrow:${p.arrow};

      --ed-pill-bg:${p.pillBg};
      --ed-pill-border:${p.pillBorder};
      --ed-pill-txt:${p.pillTxt};

      --ed-muted:${p.muted};

      --ed-invalid:${p.invalid};
      --ed-invalid-glow:${p.invalidGlow};

      --ed-pop-bg:${p.popBg};
      --ed-pop-border:${p.popBorder};
      --ed-pop-shadow1:${p.popShadow1};
      --ed-pop-shadow2:${p.popShadow2};
    `;

    // build picker list from ALL folders (not filtered), so you can always select favorites
    const q = String(this._favQuery || "").trim().toLowerCase();
    const pickerSource = baseList;

    const pickerItems = pickerSource
      .map((pval) => {
        const path = this._prettyLabel(pval);
        const nice = this._prettyMediaFolderLabel(path);
        const searchKey = `${nice} ${path}`.toLowerCase();
        return { value: String(pval), path, nice, searchKey };
      })
      .filter((it) => !q || it.searchKey.includes(q))
      .sort((a, b) => a.searchKey.localeCompare(b.searchKey));

    const favCount = favs.length;
    const favBtnText = favCount ? `Choose folders (${favCount})` : `Choose folders`;

    // save popover scroll before nuking DOM
    try {
      const list = this.shadowRoot?.querySelector("#favpop .poplist");
      if (list) this._favScrollTop = list.scrollTop || 0;
    } catch (_) {}

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; padding:8px 0; color: var(--ed-text); }
        .wrap { display:grid; gap:14px; }

        .section{
          padding:14px;
          border-radius:16px;
          background:var(--ed-section-bg);
          border:1px solid var(--ed-section-border);
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
          color: var(--ed-text);
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
          border:1px solid var(--ed-chev-border);
          background:var(--ed-chev-bg);
          display:grid;
          place-items:center;
          opacity:0.85;
          transition:0.18s ease;
          color: var(--ed-text);
        }

        .chev svg{
          width:14px;
          height:14px;
          transform:rotate(0deg);
          transition:0.18s ease;
        }

        .section[data-open="false"] .chev svg{ transform:rotate(-90deg); }

        .sbody{ margin-top:12px; display:grid; gap:12px; }
        .section[data-open="false"] .sbody{ display:none; }

        .row {
          display:grid;
          gap:8px;
          padding:14px;
          border-radius:14px;
          background:var(--ed-row-bg);
          border:1px solid var(--ed-row-border);
          color: var(--ed-text);
        }

        .lbl { font-size:13px; font-weight:900; color: var(--ed-text); }
        .desc { font-size:12px; opacity:0.8; color: var(--ed-text2); }

        code { opacity: 0.9; }

        .input {
          width:100%;
          box-sizing:border-box;
          border-radius:10px;
          border:1px solid var(--ed-input-border);
          background:var(--ed-input-bg);
          color:var(--ed-text);
          padding:10px 12px;
          font-size:13px;
          font-weight:800;
          outline:none;
        }

        .input.invalid{
          border-color: var(--ed-invalid);
          box-shadow: 0 0 0 2px var(--ed-invalid-glow);
        }

        .segwrap { display:flex; gap:8px; }
        .seg {
          flex:1;
          border:1px solid var(--ed-seg-border);
          background:var(--ed-seg-bg);
          color:var(--ed-seg-txt);
          border-radius:10px;
          padding:10px 0;
          font-size:13px;
          font-weight:800;
          cursor:pointer;
        }
        .seg.on {
          background:var(--ed-seg-on-bg);
          color:var(--ed-seg-on-txt);
          border-color:transparent;
        }

        .selectwrap{ position:relative; }
        select.select{
          appearance:none;
          -webkit-appearance:none;
          padding-right:44px;
          cursor:pointer;
        }
        .selarrow{
          position:absolute;
          top:50%;
          right:20px;
          width:10px;
          height:10px;
          transform:translateY(-50%) rotate(45deg);
          border-right:2px solid var(--ed-arrow);
          border-bottom:2px solid var(--ed-arrow);
          pointer-events:none;
          opacity:0.9;
        }

        .togrow{
          display:flex;
          align-items:center;
          justify-content:space-between;
          color: var(--ed-text);
          gap:12px;
        }

        .toggle{
          appearance:none;
          -webkit-appearance:none;
          width:46px;
          height:28px;
          border-radius:999px;
          position:relative;
          border:1px solid var(--ed-input-border);
          background:var(--ed-input-bg);
          cursor:pointer;
          flex: 0 0 auto;
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
          background:var(--ed-seg-on-bg);
          border-color:transparent;
        }

        .toggle:checked::after{
          transform:translateX(18px);
          background:var(--ed-seg-on-txt);
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
          opacity: 0.9;
          color: var(--ed-text2);
        }

        .hint ha-icon { --mdc-icon-size: 14px; color: var(--ed-text2); }

        .hint a {
          color: var(--primary-color);
          text-decoration: none;
          font-weight: 700;
        }
        .hint a:hover { text-decoration: underline; }

        .slider { width:100%; accent-color: var(--primary-color); }

        .pillval{
          min-width:52px;
          text-align:center;
          padding:6px 10px;
          border-radius:999px;
          background:var(--ed-pill-bg);
          border:1px solid var(--ed-pill-border);
          font-size:12px;
          font-weight:1000;
          color: var(--ed-pill-txt);
        }

        /* NOTE: muted no longer blocks clicks (fix) */
        .muted{
          opacity: var(--ed-muted);
        }

        /* compact picker */
        .btnrow{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .btnmini{
          border-radius:10px;
          border:1px solid var(--ed-input-border);
          background:var(--ed-input-bg);
          color: var(--ed-text);
          padding:9px 10px;
          font-size:12px;
          font-weight:1000;
          cursor:pointer;
          white-space:nowrap;
        }
        .btnmini.primary{
          background: var(--ed-seg-on-bg);
          color: var(--ed-seg-on-txt);
          border-color: transparent;
        }
        .pickwrap{ position:relative; }
        .popover{
          position:absolute;
          z-index: 5;
          left:0;
          right:0;
          margin-top:10px;
          padding:12px;
          border-radius:14px;
          background: var(--ed-pop-bg);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid var(--ed-pop-border);
          box-shadow:
            0 18px 44px var(--ed-pop-shadow1),
            0 0 0 1px var(--ed-pop-shadow2);
        }
        .pophead{
          display:flex;
          gap:10px;
          align-items:center;
          justify-content:space-between;
          margin-bottom:10px;
        }
        .poplist{
          display:grid;
          gap:8px;
          max-height: 220px;
          overflow:auto;
          padding-right:4px;
        }
        .chk{
          display:flex;
          gap:10px;
          align-items:flex-start;
          padding:10px;
          border-radius:12px;
          background: var(--ed-row-bg);
          border: 1px solid var(--ed-row-border);
          cursor:pointer;
        }
        .chk input{
          margin-top: 2px;
          width: 18px;
          height: 18px;
          accent-color: var(--primary-color);
          flex: 0 0 auto;
        }
        .chk .t{
          display:grid;
          gap:2px;
        }
        .chk .t .name{
          font-weight: 1000;
          font-size: 13px;
          color: var(--ed-text);
        }
        .chk .t .path{
          font-weight: 800;
          font-size: 12px;
          opacity: 0.75;
          color: var(--ed-text2);
          word-break: break-all;
        }
      </style>

      <div class="wrap" style="${rootVars}">

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
                <select class="input select ${
                  fileSensor && (!isSensorDomain || !entityExists) ? "invalid" : ""
                }" id="entity" ${sensorModeOn ? "" : "disabled"}>
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
              <div class="hint">Frigate users: use <code>frigate/frigate/clips</code> for clips or <code>frigate/frigate/snapshots</code> for snapshots</div>
              <div class="selectwrap">
                <select class="input select ${
                  mediaSourceIsFile ? "invalid" : ""
                }" id="mediasource" ${mediaModeOn ? "" : "disabled"}>
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
                          .map((pval) => {
                            const label = this._prettyMediaFolderLabel(this._prettyLabel(pval));
                            return `<option value="${pval}" ${
                              pval === mediaSource ? "selected" : ""
                            }>${label}</option>`;
                          })
                          .join("")
                      : `<option value="${mediaSource}" selected>(no folders found)</option>`
                  }
                </select>
                <span class="selarrow"></span>
              </div>

              <div style="margin-top:10px; display:grid; gap:10px;">
                <div class="pickwrap">
                  <div class="btnrow">
                    <button class="btnmini ${this._favPickerOpen ? "primary" : ""}" id="favbtn" type="button">
                      ${favBtnText}
                    </button>
                    <button class="btnmini" id="favall" type="button">All</button>
                    <button class="btnmini" id="favnone" type="button">None</button>
                  </div>

                  ${
                    this._favPickerOpen
                      ? `
                    <div class="popover" id="favpop">
                      <div class="pophead">
                        <input class="input" id="favquery" placeholder="Search folders…" value="${String(
                          this._favQuery || ""
                        ).replace(/"/g, "&quot;")}" />
                        <button class="btnmini" id="favclose" type="button">Close</button>
                      </div>
                      <div class="poplist">
                        ${
                          mediaLoading
                            ? `<div class="desc">(loading…)</div>`
                            : pickerItems.length
                            ? pickerItems
                                .map((it) => {
                                  const checked = favs.includes(it.value);
                                  return `
                                    <label class="chk">
                                      <input type="checkbox" data-fav="${it.value}" ${
                                    checked ? "checked" : ""
                                  }/>
                                      <div class="t">
                                        <div class="name">${it.nice}</div>
                                        <div class="path">${it.path}</div>
                                      </div>
                                    </label>
                                  `;
                                })
                                .join("")
                            : `<div class="desc">(no results)</div>`
                        }
                      </div>
                    </div>
                  `
                      : ""
                  }
                </div>
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

            <div class="row">
              <div class="lbl">Maximum thumbnails shown</div>
              <input class="input" id="maxmedia" type="number" min="1" max="2000" value="${maxMedia}" />
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

        // restore popover scroll after re-render
    try {
      const list = this.shadowRoot?.querySelector("#favpop .poplist");
      if (list && Number.isFinite(this._favScrollTop)) {
        list.scrollTop = this._favScrollTop;
      }
    } catch (_) {}

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
        this._secOpen[id] = next;
      });
    });

    // source mode buttons
    this.shadowRoot.querySelectorAll("[data-src]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("source_mode", btn.dataset.src)
      );
    });

    $("entity")?.addEventListener("change", (e) =>
      this._set("entity", String(e.target.value || "").trim())
    );

    $("mediasource")?.addEventListener("change", (e) =>
      this._set("media_source", String(e.target.value || "").trim())
    );

    // open/close picker (always allowed; UI is muted if not in media mode)
    $("favbtn")?.addEventListener("click", () => this._toggleFavPicker());
    $("favclose")?.addEventListener("click", () => this._toggleFavPicker(false));

    // search
    $("favquery")?.addEventListener("input", (e) => {
      this._favQuery = String(e.target.value || "");
      this._scheduleRender();
    });

    // all / none (writes ONE key)
    $("favall")?.addEventListener("click", () => {
      const all = (Array.isArray(this._mediaFolders) ? this._mediaFolders : []).map(String);
      this._setFavFolders(all);
    });

    $("favnone")?.addEventListener("click", () => {
      this._setFavFolders([]); // removes key
    });

    const pop = $("favpop");
    const poplist = this.shadowRoot?.querySelector("#favpop .poplist");

    // bind scroll listener once per render-cycle (to the new DOM node)
    if (poplist) {
      poplist.addEventListener(
        "scroll",
        () => {
          this._favScrollTop = poplist.scrollTop || 0;
        },
        { passive: true }
      );
    }

    pop?.addEventListener("change", (e) => {
      const t = e.target;
      if (!t || t.tagName !== "INPUT" || t.type !== "checkbox") return;

      const val = String(t.getAttribute("data-fav") || "");
      if (!val) return;

      // keep scroll stable when checking/unchecking (DOM rebuild)
      // scrollTop will be saved+restored by the _render() hooks above

      const current = new Set(this._getFavFolders());
      if (t.checked) current.add(val);
      else current.delete(val);

      this._setFavFolders(Array.from(current));
    });

    $("delservice")?.addEventListener("change", (e) => {
      const v = String(e.target.value || "").trim();
      if (!v) {
        const next = { ...this._config };
        delete next.delete_service;
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

    // preview position segmented buttons
    this.shadowRoot.querySelectorAll(".seg[data-ppos]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("preview_position", btn.dataset.ppos)
      );
    });

    $("thumb")?.addEventListener("change", (e) =>
      this._set("thumb_size", Number(e.target.value) || 140)
    );

    // max_media handler (live + on change)
    const pushMaxMedia = (raw) => {
      const n = this._numInt(raw, 1);
      const v = this._clampInt(n, 1, 2000);
      this._set("max_media", v);
    };
    $("maxmedia")?.addEventListener("input", (e) =>
      pushMaxMedia(e.target.value)
    );
    $("maxmedia")?.addEventListener("change", (e) =>
      pushMaxMedia(e.target.value)
    );

    $("clicktoopen")?.addEventListener("change", (e) => {
      this._set("preview_click_to_open", !!e.target.checked);
    });

    // timestamp position segmented buttons
    this.shadowRoot.querySelectorAll(".seg[data-pos]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("bar_position", btn.dataset.pos)
      );
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
      this._set("bar_opacity", Number.isFinite(v) ? v : 45);
    });

    // ✅ RESTORE focus + caret AFTER render
    try {
      const fs = this._focusState;
      if (fs && fs.id) {
        const el = $(fs.id);
        if (el && typeof el.focus === "function") {
          // re-apply value (mainly for favquery safety)
          if (fs.value != null && typeof el.value === "string" && el.value !== fs.value) {
            el.value = fs.value;
          }
          el.focus({ preventScroll: true });

          // restore caret/selection if possible
          if (fs.start != null && fs.end != null && typeof el.setSelectionRange === "function") {
            el.setSelectionRange(fs.start, fs.end);
          }
        }
      }
    } catch (_) {}
  }
}

if (!customElements.get("camera-gallery-card-editor")) {
  customElements.define("camera-gallery-card-editor", CameraGalleryCardEditor);
}

console.info("CAMERA GALLERY EDITOR: registered OK");
