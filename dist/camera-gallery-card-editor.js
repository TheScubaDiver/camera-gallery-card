/* camera-gallery-card-editor.js */

const AVAILABLE_OBJECT_FILTERS = [
  "bicycle",
  "bird",
  "bus",
  "car",
  "cat",
  "dog",
  "motorcycle",
  "person",
  "truck",
];

const MAX_VISIBLE_OBJECT_FILTERS = AVAILABLE_OBJECT_FILTERS.length;

class CameraGalleryCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this.attachShadow({ mode: "open" });

    this._activeTab = "general";
    this._focusState = null;
    this._lastSuggestFingerprint = {
      entities: "",
      mediasources: "",
    };
    this._mediaBrowseCache = new Map();
    this._mediaSuggestReq = 0;
    this._mediaSuggestTimer = null;
    this._raf = null;

    this._suggestState = {
      entities: { open: false, items: [], index: -1 },
      mediasources: { open: false, items: [], index: -1 },
    };
  }

  _applyFieldValidation(id) {
    const el = this.shadowRoot?.getElementById(id);
    if (!el) return;
    const field = el.closest(".field");
    if (!field) return;

    field.classList.remove("valid", "invalid");

    let state = "neutral";
    if (id === "entities") state = this._validateSensors(el.value);
    if (id === "mediasources") state = this._validateMediaFolders(el.value);

    if (state === "valid") field.classList.add("valid");
    if (state === "invalid") field.classList.add("invalid");
  }

  _applySuggestion(id, value) {
    const el = this.shadowRoot?.getElementById(id);
    if (!el) return;

    this._replaceCurrentLine(el, value);

    if (id === "entities") {
      this._commitEntities(false);
      this._applyFieldValidation("entities");
    } else if (id === "mediasources") {
      this._commitMediaSources(false);
      this._applyFieldValidation("mediasources");
    }

    this._closeSuggestions(id);
  }

  _acceptSuggestion(id) {
    const state = this._suggestState[id];
    if (!state?.open || !state.items.length) return false;
    const idx = state.index >= 0 ? state.index : 0;
    const value = state.items[idx];
    this._applySuggestion(id, value);
    return true;
  }

  async _browseMediaFolders(mediaContentId) {
    const id = this._normalizeMediaSourceValue(mediaContentId);
    if (!id || !this._hass?.callWS) return [];

    if (this._mediaBrowseCache.has(id)) {
      return this._mediaBrowseCache.get(id);
    }

    try {
      const result = await this._hass.callWS({
        type: "media_source/browse_media",
        media_content_id: id,
      });

      const children = Array.isArray(result?.children) ? result.children : [];
      const folders = children
        .filter((child) => this._isFolderNode(child))
        .map((child) => String(child.media_content_id || "").trim())
        .filter((v) => v.startsWith("media-source://"));

      const clean = this._sortUniqueStrings(folders);
      this._mediaBrowseCache.set(id, clean);
      return clean;
    } catch (_) {
      this._mediaBrowseCache.set(id, []);
      return [];
    }
  }

  _clampInt(n, min, max) {
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  _closeSuggestions(id) {
    this._suggestState[id] = { open: false, items: [], index: -1 };
    this._lastSuggestFingerprint[id] = "";
    this._renderSuggestions(id);
  }

  _collectEntitySuggestions() {
    if (!this._hass) return [];
    return Object.values(this._hass.states)
      .filter(
        (e) =>
          e.entity_id.startsWith("sensor.") &&
          e.attributes?.fileList !== undefined
      )
      .map((e) => e.entity_id)
      .sort((a, b) => a.localeCompare(b));
  }

  async _collectMediaSuggestionsDynamic(query) {
    const defaults = this._getDefaultMediaSuggestions();
    const q = this._normalizeMediaSourceValue(query);

    if (!q) return defaults.slice(0, 8);

    if (!q.startsWith("media-source://")) {
      return defaults
        .filter((v) => v.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 8);
    }

    const exactFolders = await this._browseMediaFolders(q);
    if (exactFolders.length) return exactFolders.slice(0, 8);

    const { base, needle } = this._mediaBaseAndNeedle(q);

    if (!base) {
      return defaults
        .filter((v) => v.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 8);
    }

    const baseFolders = await this._browseMediaFolders(base);
    if (!baseFolders.length) {
      return defaults
        .filter((v) => v.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 8);
    }

    const filtered = !needle
      ? baseFolders
      : baseFolders.filter((v) => {
          const tail = v.slice(base.length + 1).toLowerCase();
          return tail.includes(needle.toLowerCase());
        });

    return filtered.slice(0, 8);
  }

  _commitEntities(commit = false) {
    const entitiesEl = this.shadowRoot?.getElementById("entities");
    const raw = String(entitiesEl?.value || "");
    const arr = this._parseTextList(raw);

    if (!arr.length) {
      const next = { ...this._config };
      delete next.entities;
      delete next.entity;
      this._config = this._stripAlwaysTrueKeys(next);
      if (commit) {
        this._fire();
        this._scheduleRender();
      }
      return;
    }

    const next = { ...this._config, entities: arr };
    delete next.entity;
    this._config = this._stripAlwaysTrueKeys(next);

    if (commit) {
      this._fire();
      this._scheduleRender();
    }
  }

  _commitMediaSources(commit = false) {
    const mediaEl = this.shadowRoot?.getElementById("mediasources");
    const raw = String(mediaEl?.value || "");
    const arr = this._parseTextList(raw);

    if (!arr.length) {
      const next = { ...this._config };
      delete next.media_source;
      delete next.media_sources;
      this._config = this._stripAlwaysTrueKeys(next);
      if (commit) {
        this._fire();
        this._scheduleRender();
      }
      return;
    }

    const next = { ...this._config, media_sources: arr };
    delete next.media_source;
    this._config = this._stripAlwaysTrueKeys(next);

    if (commit) {
      this._fire();
      this._scheduleRender();
    }
  }

  _filterSuggestions(list, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return list.slice(0, 8);
    return list
      .filter((v) => String(v).toLowerCase().includes(q))
      .slice(0, 8);
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

  _getDefaultMediaSuggestions() {
    const defaults = [
      "media-source://frigate/frigate/event-search/clips",
      "media-source://frigate/frigate/event-search/snapshots",
      "media-source://media_source/local",
      "media-source://media_source/local/mac_share",
    ];

    const cfg = Array.isArray(this._config.media_sources)
      ? this._config.media_sources
          .map(String)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const set = new Set([...defaults, ...cfg]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  _getTextareaLineInfo(el) {
    const value = String(el?.value || "");
    const caret =
      typeof el.selectionStart === "number" ? el.selectionStart : value.length;

    const before = value.slice(0, caret);
    const after = value.slice(caret);

    const lineStart = before.lastIndexOf("\n") + 1;
    const nextNl = after.indexOf("\n");
    const lineEnd = nextNl === -1 ? value.length : caret + nextNl;

    const line = value.slice(lineStart, lineEnd);
    const lineCaret = caret - lineStart;

    return { value, caret, lineStart, lineEnd, line, lineCaret };
  }

  _isFolderNode(node) {
    const cls = String(node?.media_class || "").toLowerCase();
    const type = String(node?.media_content_type || "").toLowerCase();
    const id = String(node?.media_content_id || "");

    if (cls === "app" || cls === "channel" || cls === "directory") return true;
    if (type === "directory") return true;
    if (id.startsWith("media-source://") && !/\.[a-z0-9]{2,6}$/i.test(id)) {
      return true;
    }
    return false;
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

  _looksLikeFile(relPath) {
    const v = String(relPath || "");
    if (v.startsWith("media-source://")) return false;
    const last = v.split("/").pop() || "";
    return /\.(jpg|jpeg|png|gif|webp|mp4|mov|mkv|avi|m4v|wav|mp3|aac|flac|pdf|txt|json)$/i.test(
      last
    );
  }

  _luminance({ r, g, b }) {
    const srgb = [r, g, b].map((x) => {
      x = x / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }

  _mediaBaseAndNeedle(rawLine) {
    const line = this._normalizeMediaSourceValue(rawLine);

    if (!line.startsWith("media-source://")) {
      return { base: "", needle: line };
    }

    const lastSlash = line.lastIndexOf("/");
    if (lastSlash <= "media-source://".length - 1) {
      return { base: line, needle: "" };
    }

    const tail = line.slice(lastSlash + 1);
    const parent = line.slice(0, lastSlash);

    if (!tail) return { base: parent, needle: "" };

    return { base: parent, needle: tail };
  }

  _moveSuggestion(id, dir) {
    const state = this._suggestState[id];
    if (!state?.open || !state.items.length) return;

    let idx = state.index + dir;
    if (idx < 0) idx = state.items.length - 1;
    if (idx >= state.items.length) idx = 0;

    this._suggestState[id] = { ...state, index: idx };
    this._renderSuggestions(id);
  }

  _normalizeMediaSourceValue(v) {
    let s = String(v || "").trim();
    if (!s) return "";
    s = s.replace(/\s+/g, "");
    s = s.replace(/\/{2,}$/g, "");
    return s;
  }

  _normalizeObjectFilters(listOrSingle) {
    const arr = Array.isArray(listOrSingle)
      ? listOrSingle
      : listOrSingle
        ? [listOrSingle]
        : [];

    const out = [];
    const seen = new Set();
    const allowed = new Set(
      AVAILABLE_OBJECT_FILTERS.map((x) => String(x).toLowerCase())
    );

    for (const raw of arr) {
      const v = String(raw || "").toLowerCase().trim();
      if (!v) continue;
      if (!allowed.has(v)) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }

    return out;
  }

  _numInt(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.round(n);
  }

  _objectIcon(v) {
    const map = {
      bicycle: "mdi:bicycle",
      bird: "mdi:bird",
      bus: "mdi:bus",
      car: "mdi:car",
      cat: "mdi:cat",
      dog: "mdi:dog",
      motorcycle: "mdi:motorbike",
      person: "mdi:account",
      truck: "mdi:truck",
    };
    return map[v] || "mdi:shape";
  }

  _objectLabel(v) {
    const s = String(v || "").toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  _openSuggestions(id, items) {
    const prev = this._suggestState[id] || {
      open: false,
      items: [],
      index: -1,
    };

    const sameItems =
      JSON.stringify(prev.items || []) === JSON.stringify(items || []);

    this._suggestState[id] = {
      open: !!items.length,
      items,
      index: sameItems
        ? Math.min(
            prev.index >= 0 ? prev.index : 0,
            Math.max(items.length - 1, 0)
          )
        : items.length
          ? 0
          : -1,
    };

    this._renderSuggestions(id);
  }

  _parseCssColorToRgb(v) {
    const s = String(v || "").trim().toLowerCase();
    if (!s) return null;

    const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };

    if (s.startsWith("#")) {
      const hex = s.slice(1);
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16),
        };
      }
      if (hex.length >= 6) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
        };
      }
    }
    return null;
  }

  _parseTextList(raw) {
    const s = String(raw || "");
    const parts = s
      .split(/\n|,/g)
      .map((x) => String(x || "").trim())
      .filter(Boolean);

    const out = [];
    const seen = new Set();
    for (const p of parts) {
      const key = String(p).trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(String(p).trim());
    }
    return out;
  }

  _prettyLabel(choiceValue) {
    const v = String(choiceValue || "");
    if (!v) return "";
    if (v.startsWith("media-source://")) return this._toRel(v);
    return v;
  }

  _render() {
    const c = this._config || {};

    try {
      const ae = this.shadowRoot?.activeElement;
      if (ae && ae.id) {
        const st =
          typeof ae.selectionStart === "number" ? ae.selectionStart : null;
        const en =
          typeof ae.selectionEnd === "number" ? ae.selectionEnd : null;
        this._focusState = {
          id: ae.id,
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

    const cSourceMode = String(c.source_mode || "sensor");
    const sensorModeOn = cSourceMode === "sensor";
    const mediaModeOn = cSourceMode === "media";

    const entitiesArr = Array.isArray(c.entities)
      ? c.entities.map(String).map((s) => s.trim()).filter(Boolean)
      : [];
    const legacyEntity = String(c.entity || "").trim();
    const effectiveEntities = entitiesArr.length
      ? entitiesArr
      : legacyEntity
        ? [legacyEntity]
        : [];
    const entitiesText = this._sourcesToText(effectiveEntities);

    const invalidEntities = effectiveEntities.filter((id) => {
      const isSensorDomain = /^sensor\./i.test(id);
      const exists = !!this._hass?.states?.[id];
      return !isSensorDomain || !exists;
    });

    const mediaSourcesArr = Array.isArray(c.media_sources)
      ? c.media_sources.map(String).map((s) => s.trim()).filter(Boolean)
      : [];
    const mediaSourcesText = this._sourcesToText(mediaSourcesArr);

    const mediaHasFile = mediaSourcesArr.some((s) =>
      this._looksLikeFile(this._prettyLabel(s))
    );

    const filenameDatetimeFormat = String(
      c.filename_datetime_format || ""
    ).trim();

    const objectFiltersArr = this._normalizeObjectFilters(c.object_filters || []);
    const selectedCount = objectFiltersArr.length;

    const height = Number(c.preview_height) || 320;
    const thumbSize = Number(c.thumb_size) || 140;
    const maxMedia = (() => {
      const n = this._numInt(c.max_media, 20);
      return this._clampInt(n, 1, 100);
    })();

    const tsPos = String(c.bar_position || "top");
    const previewPos = String(c.preview_position || "top");

    const thumbBarPos = (() => {
      const v = String(c.thumb_bar_position || "bottom").toLowerCase().trim();
      if (v === "hidden") return "hidden";
      if (v === "top") return "top";
      return "bottom";
    })();

    const thumbLayout = (() => {
      const v = String(c.thumb_layout || "horizontal").toLowerCase().trim();
      return v === "vertical" ? "vertical" : "horizontal";
    })();

    const thumbSizeMuted = thumbLayout === "vertical";

    const allServices = this._hass?.services || {};
    const shellCmds = Object.keys(allServices.shell_command || {})
      .map((svc) => `shell_command.${svc}`)
      .sort((a, b) => a.localeCompare(b));

    const deleteService = String(c.delete_service || c.shell_command || "").trim();
    const deleteOk =
      !deleteService || /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(deleteService);

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

    const liveEnabled = c.live_enabled === true;
    const liveCameraEntity = String(c.live_camera_entity || "").trim();
    const liveDefault = c.live_default === true;

    const cameraEntities = Object.keys(this._hass?.states || {})
      .filter((id) => id.startsWith("camera."))
      .sort((a, b) => a.localeCompare(b));

    const isLight = this._isLightTheme();

    const dark = {
      arrow: "rgba(255,255,255,0.78)",
      chipBg: "rgba(255,255,255,0.035)",
      chipBorder: "rgba(255,255,255,0.09)",
      chipDisabled: "0.42",
      chipIconBg: "rgba(255,255,255,0.07)",
      chipOnBg: "rgba(255,255,255,0.12)",
      chipOnBorder: "rgba(255,255,255,0.18)",
      chipOnIconBg: "rgba(255,255,255,0.16)",
      chipOnTxt: "rgba(255,255,255,0.98)",
      chipTxt: "rgba(255,255,255,0.92)",
      focusRing: "rgba(255,255,255,0.12)",
      inputBg: "rgba(255,255,255,0.055)",
      inputBorder: "rgba(255,255,255,0.08)",
      invalid: "rgba(255, 91, 91, 0.92)",
      invalidGlow: "rgba(255, 91, 91, 0.14)",
      muted: "0.56",
      pillBg: "rgba(255,255,255,0.10)",
      pillBorder: "rgba(255,255,255,0.08)",
      pillTxt: "rgba(255,255,255,0.98)",
      rowBg: "rgba(255,255,255,0.028)",
      rowBorder: "rgba(255,255,255,0.055)",
      sectionBg: "rgba(255,255,255,0.03)",
      sectionBorder: "rgba(255,255,255,0.06)",
      sectionGlow: "0 1px 0 rgba(255,255,255,0.03) inset",
      segBg: "rgba(255,255,255,0.045)",
      segBorder: "rgba(255,255,255,0.08)",
      segOnBg: "#ffffff",
      segOnTxt: "rgba(0,0,0,0.96)",
      segTxt: "rgba(255,255,255,0.78)",
      selectBg: "rgba(255,255,255,0.055)",
      selectBorder: "rgba(255,255,255,0.08)",
      suggActive: "rgba(255,255,255,0.14)",
      suggBg: "rgba(18,18,22,0.98)",
      suggBorder: "rgba(255,255,255,0.09)",
      suggHover: "rgba(255,255,255,0.08)",
      tabBg: "rgba(255,255,255,0.035)",
      tabBorder: "rgba(255,255,255,0.07)",
      tabOnBg: "rgba(255,255,255,0.12)",
      tabOnBorder: "rgba(255,255,255,0.16)",
      tabOnTxt: "rgba(255,255,255,0.99)",
      tabTxt: "rgba(255,255,255,0.76)",
      text: "rgba(255,255,255,0.94)",
      text2: "rgba(255,255,255,0.70)",
      valid: "rgba(64, 196, 120, 0.95)",
      validGlow: "rgba(64, 196, 120, 0.14)",
    };

    const lightPal = {
      arrow: "rgba(0,0,0,0.58)",
      chipBg: "rgba(0,0,0,0.028)",
      chipBorder: "rgba(0,0,0,0.09)",
      chipDisabled: "0.46",
      chipIconBg: "rgba(0,0,0,0.05)",
      chipOnBg: "rgba(0,0,0,0.075)",
      chipOnBorder: "rgba(0,0,0,0.14)",
      chipOnIconBg: "rgba(0,0,0,0.10)",
      chipOnTxt: "rgba(0,0,0,0.94)",
      chipTxt: "rgba(0,0,0,0.88)",
      focusRing: "rgba(0,0,0,0.08)",
      inputBg: "rgba(0,0,0,0.028)",
      inputBorder: "rgba(0,0,0,0.10)",
      invalid: "rgba(219,68,55,0.92)",
      invalidGlow: "rgba(219,68,55,0.14)",
      muted: "0.64",
      pillBg: "rgba(0,0,0,0.56)",
      pillBorder: "rgba(0,0,0,0.14)",
      pillTxt: "rgba(255,255,255,0.98)",
      rowBg: "rgba(0,0,0,0.018)",
      rowBorder: "rgba(0,0,0,0.055)",
      sectionBg: "rgba(0,0,0,0.02)",
      sectionBorder: "rgba(0,0,0,0.07)",
      sectionGlow: "0 1px 0 rgba(255,255,255,0.6) inset",
      segBg: "rgba(0,0,0,0.03)",
      segBorder: "rgba(0,0,0,0.08)",
      segOnBg: "rgba(0,0,0,0.9)",
      segOnTxt: "rgba(255,255,255,0.99)",
      segTxt: "rgba(0,0,0,0.70)",
      selectBg: "rgba(0,0,0,0.028)",
      selectBorder: "rgba(0,0,0,0.10)",
      suggActive: "rgba(0,0,0,0.08)",
      suggBg: "rgba(255,255,255,0.99)",
      suggBorder: "rgba(0,0,0,0.10)",
      suggHover: "rgba(0,0,0,0.045)",
      tabBg: "rgba(0,0,0,0.025)",
      tabBorder: "rgba(0,0,0,0.08)",
      tabOnBg: "rgba(0,0,0,0.08)",
      tabOnBorder: "rgba(0,0,0,0.14)",
      tabOnTxt: "rgba(0,0,0,0.94)",
      tabTxt: "rgba(0,0,0,0.70)",
      text: "rgba(0,0,0,0.90)",
      text2: "rgba(0,0,0,0.62)",
      valid: "rgba(46, 160, 67, 0.95)",
      validGlow: "rgba(46, 160, 67, 0.14)",
    };

    const p = isLight ? lightPal : dark;

    const rootVars = `
      --ed-radius-panel:18px;
      --ed-radius-row:16px;
      --ed-radius-input:12px;
      --ed-radius-pill:999px;
      --ed-space-1:8px;
      --ed-space-2:12px;
      --ed-space-3:16px;
      --ed-space-4:20px;
      --ed-shadow-soft:0 8px 24px rgba(0,0,0,0.10);
      --ed-shadow-float:0 14px 36px rgba(0,0,0,0.18);

      --ed-arrow:${p.arrow};
      --ed-chip-bg:${p.chipBg};
      --ed-chip-border:${p.chipBorder};
      --ed-chip-disabled:${p.chipDisabled};
      --ed-chip-icon-bg:${p.chipIconBg};
      --ed-chip-on-bg:${p.chipOnBg};
      --ed-chip-on-border:${p.chipOnBorder};
      --ed-chip-on-icon-bg:${p.chipOnIconBg};
      --ed-chip-on-txt:${p.chipOnTxt};
      --ed-chip-txt:${p.chipTxt};
      --ed-focus-ring:${p.focusRing};
      --ed-input-bg:${p.inputBg};
      --ed-input-border:${p.inputBorder};
      --ed-invalid:${p.invalid};
      --ed-invalid-glow:${p.invalidGlow};
      --ed-muted:${p.muted};
      --ed-pill-bg:${p.pillBg};
      --ed-pill-border:${p.pillBorder};
      --ed-pill-txt:${p.pillTxt};
      --ed-row-bg:${p.rowBg};
      --ed-row-border:${p.rowBorder};
      --ed-section-bg:${p.sectionBg};
      --ed-section-border:${p.sectionBorder};
      --ed-section-glow:${p.sectionGlow};
      --ed-seg-bg:${p.segBg};
      --ed-seg-border:${p.segBorder};
      --ed-seg-on-bg:${p.segOnBg};
      --ed-seg-on-txt:${p.segOnTxt};
      --ed-seg-txt:${p.segTxt};
      --ed-select-bg:${p.selectBg};
      --ed-select-border:${p.selectBorder};
      --ed-sugg-active:${p.suggActive};
      --ed-sugg-bg:${p.suggBg};
      --ed-sugg-border:${p.suggBorder};
      --ed-sugg-hover:${p.suggHover};
      --ed-tab-bg:${p.tabBg};
      --ed-tab-border:${p.tabBorder};
      --ed-tab-on-bg:${p.tabOnBg};
      --ed-tab-on-border:${p.tabOnBorder};
      --ed-tab-on-txt:${p.tabOnTxt};
      --ed-tab-txt:${p.tabTxt};
      --ed-text:${p.text};
      --ed-text2:${p.text2};
      --ed-valid:${p.valid};
      --ed-valid-glow:${p.validGlow};
    `;

    const tabBtn = (key, label, icon) => `
      <button
        type="button"
        class="tabbtn ${this._activeTab === key ? "on" : ""}"
        data-tab="${key}"
      >
        <ha-icon icon="${icon}"></ha-icon>
        <span>${label}</span>
      </button>
    `;

    const panelHead = (icon, title, subtitle) => `
      <div class="panelhead">
        <div class="panelicon">
          <ha-icon icon="${icon}"></ha-icon>
        </div>
        <div class="panelhead-copy">
          <div class="paneltitle">${title}</div>
          ${subtitle ? `<div class="panelsubtitle">${subtitle}</div>` : ``}
        </div>
      </div>
    `;

    this.shadowRoot.innerHTML = `
      <style>
        :host{
          display:block;
          padding:8px 0;
          color:var(--ed-text);
          box-sizing:border-box;
          min-width:0;
        }

        .wrap{
          display:grid;
          gap:var(--ed-space-3);
          min-width:0;
        }

        .desc,
        code{
          overflow-wrap:anywhere;
          word-break:break-word;
        }

        .tabs{
          display:grid;
          gap:var(--ed-space-3);
        }

        .tabbar{
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:10px;
          padding:10px;
          border-radius:var(--ed-radius-panel);
          background:var(--ed-section-bg);
          border:1px solid var(--ed-section-border);
          box-shadow:var(--ed-section-glow);
        }

        .tabbtn{
          appearance:none;
          -webkit-appearance:none;
          border:1px solid var(--ed-tab-border);
          background:var(--ed-tab-bg);
          color:var(--ed-tab-txt);
          border-radius:14px;
          min-height:46px;
          padding:10px 14px;
          cursor:pointer;
          font-size:13px;
          font-weight:900;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:8px;
          text-align:center;
          transition:
            background 0.18s ease,
            border-color 0.18s ease,
            color 0.18s ease,
            transform 0.18s ease,
            box-shadow 0.18s ease;
          min-width:0;
          box-shadow:0 1px 0 rgba(255,255,255,0.03) inset;
        }

        .tabbtn:hover{
          transform:translateY(-1px);
        }

        .tabbtn ha-icon{
          --mdc-icon-size:16px;
          width:16px;
          height:16px;
          flex:0 0 auto;
        }

        .tabbtn.on{
          background:var(--ed-tab-on-bg);
          border-color:var(--ed-tab-on-border);
          color:var(--ed-tab-on-txt);
          box-shadow:
            0 1px 0 rgba(255,255,255,0.04) inset,
            0 6px 16px rgba(0,0,0,0.10);
        }

        .tabpanel{
          padding:16px;
          border-radius:var(--ed-radius-panel);
          background:var(--ed-section-bg);
          border:1px solid var(--ed-section-border);
          display:grid;
          gap:14px;
          box-shadow:var(--ed-section-glow);
        }

        .panelhead{
          display:flex;
          align-items:center;
          gap:14px;
          padding-bottom:14px;
          border-bottom:1px solid var(--ed-row-border);
          min-width:0;
        }

        .panelicon{
          width:40px;
          height:40px;
          min-width:40px;
          border-radius:14px;
          display:grid;
          place-items:center;
          background:var(--ed-input-bg);
          border:1px solid var(--ed-input-border);
          box-shadow:0 1px 0 rgba(255,255,255,0.03) inset;
        }

        .panelicon ha-icon{
          --mdc-icon-size:20px;
          width:20px;
          height:20px;
          color:var(--ed-text);
        }

        .panelhead-copy{
          min-width:0;
          display:grid;
          gap:4px;
        }

        .paneltitle{
          font-size:16px;
          font-weight:1000;
          color:var(--ed-text);
          line-height:1.2;
        }

        .panelsubtitle{
          font-size:12px;
          color:var(--ed-text2);
          line-height:1.45;
        }

        .row{
          display:grid;
          gap:12px;
          padding:16px;
          border-radius:var(--ed-radius-row);
          background:var(--ed-row-bg);
          border:1px solid var(--ed-row-border);
          color:var(--ed-text);
          min-width:0;
          transition:
            background 0.18s ease,
            border-color 0.18s ease,
            box-shadow 0.18s ease;
        }

        .row:hover{
          border-color:color-mix(in srgb, var(--ed-row-border) 70%, var(--ed-text2) 30%);
        }

        .row-head{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
          min-width:0;
        }

        .row-head > :first-child{
          min-width:0;
          flex:1 1 auto;
          display:grid;
          gap:6px;
        }

        .lbl{
          font-size:13px;
          font-weight:950;
          color:var(--ed-text);
          line-height:1.2;
          letter-spacing:0.01em;
        }

        .desc{
          font-size:12px;
          opacity:0.88;
          color:var(--ed-text2);
          line-height:1.45;
        }

        code{
          opacity:0.95;
        }

        ha-textfield,
        ha-slider{
          width:100%;
        }

        .field{
          position:relative;
          min-width:0;
        }

        .field textarea{
          width:100%;
          box-sizing:border-box;
          border-radius:var(--ed-radius-input);
          border:1px solid var(--ed-input-border);
          background:var(--ed-input-bg);
          color:var(--ed-text);
          padding:13px 14px;
          font-size:13px;
          font-weight:800;
          outline:none;
          resize:vertical;
          min-height:112px;
          line-height:1.45;
          white-space:pre-wrap;
          font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          transition:
            border-color 0.16s ease,
            box-shadow 0.16s ease,
            background 0.16s ease;
          box-shadow:0 1px 0 rgba(255,255,255,0.03) inset;
        }

        .field textarea::placeholder{
          color:color-mix(in srgb, var(--ed-text2) 82%, transparent);
        }

        .field textarea:hover{
          border-color:color-mix(in srgb, var(--ed-input-border) 70%, var(--ed-text2) 30%);
        }

        .field textarea:focus{
          border-color:color-mix(in srgb, var(--ed-input-border) 25%, var(--primary-color, #03a9f4) 75%);
          box-shadow:
            0 0 0 3px var(--ed-focus-ring),
            0 1px 0 rgba(255,255,255,0.03) inset;
        }

        .field textarea:disabled{
          opacity:0.65;
          cursor:not-allowed;
        }

        .field.valid textarea{
          border-color:var(--ed-valid);
          box-shadow:0 0 0 3px var(--ed-valid-glow);
        }

        .field.invalid textarea{
          border-color:var(--ed-invalid);
          box-shadow:0 0 0 3px var(--ed-invalid-glow);
        }

        .suggestions{
          position:absolute;
          left:0;
          right:0;
          top:calc(100% + 8px);
          background:var(--ed-sugg-bg);
          border:1px solid var(--ed-sugg-border);
          border-radius:14px;
          box-shadow:var(--ed-shadow-float);
          padding:8px;
          display:grid;
          gap:4px;
          z-index:999;
          max-height:280px;
          overflow:auto;
          backdrop-filter:blur(10px);
          -webkit-backdrop-filter:blur(10px);
        }

        .suggestions[hidden]{
          display:none;
        }

        .sugg-label{
          padding:6px 10px 8px;
          font-size:11px;
          font-weight:900;
          letter-spacing:0.04em;
          text-transform:uppercase;
          color:var(--ed-text2);
        }

        .sugg-item{
          appearance:none;
          -webkit-appearance:none;
          border:0;
          background:transparent;
          color:var(--ed-text);
          text-align:left;
          padding:11px 12px;
          border-radius:10px;
          cursor:pointer;
          font-size:12px;
          font-weight:800;
          font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          white-space:normal;
          overflow:visible;
          text-overflow:clip;
          word-break:break-word;
          overflow-wrap:anywhere;
          line-height:1.35;
          transition:background 0.14s ease, transform 0.14s ease;
        }

        .sugg-item:hover{
          background:var(--ed-sugg-hover);
        }

        .sugg-item.active{
          background:var(--ed-sugg-active);
        }

        .sugg-active-path{
          padding:9px 10px 4px;
          font-size:11px;
          opacity:0.75;
          word-break:break-word;
          overflow-wrap:anywhere;
          border-top:1px solid var(--ed-sugg-border);
          margin-top:4px;
          color:var(--ed-text2);
        }

        .selectwrap{
          position:relative;
          min-width:0;
        }

        .select{
          width:100%;
          box-sizing:border-box;
          border-radius:var(--ed-radius-input);
          border:1px solid var(--ed-select-border);
          background:var(--ed-select-bg);
          color:var(--ed-text);
          padding:12px 42px 12px 14px;
          font-size:13px;
          font-weight:800;
          outline:none;
          min-width:0;
          appearance:none;
          -webkit-appearance:none;
          cursor:pointer;
          transition:
            border-color 0.16s ease,
            box-shadow 0.16s ease,
            background 0.16s ease;
          box-shadow:0 1px 0 rgba(255,255,255,0.03) inset;
        }

        .select:hover{
          border-color:color-mix(in srgb, var(--ed-select-border) 70%, var(--ed-text2) 30%);
        }

        .select:focus{
          border-color:color-mix(in srgb, var(--ed-select-border) 25%, var(--primary-color, #03a9f4) 75%);
          box-shadow:
            0 0 0 3px var(--ed-focus-ring),
            0 1px 0 rgba(255,255,255,0.03) inset;
        }

        .select:disabled{
          opacity:0.65;
          cursor:not-allowed;
        }

        .selarrow{
          position:absolute;
          top:50%;
          right:16px;
          width:10px;
          height:10px;
          transform:translateY(-60%) rotate(45deg);
          border-right:2px solid var(--ed-arrow);
          border-bottom:2px solid var(--ed-arrow);
          pointer-events:none;
          opacity:0.9;
        }

        .select.invalid{
          border-color:var(--ed-invalid);
          box-shadow:0 0 0 3px var(--ed-invalid-glow);
        }

        .segwrap{
          display:flex;
          gap:8px;
        }

        .seg{
          flex:1;
          border:1px solid var(--ed-seg-border);
          background:var(--ed-seg-bg);
          color:var(--ed-seg-txt);
          border-radius:12px;
          padding:11px 0;
          font-size:13px;
          font-weight:850;
          cursor:pointer;
          min-width:0;
          transition:
            background 0.16s ease,
            border-color 0.16s ease,
            color 0.16s ease,
            transform 0.16s ease,
            box-shadow 0.16s ease;
        }

        .seg:hover{
          transform:translateY(-1px);
        }

        .seg.on{
          background:var(--ed-seg-on-bg);
          color:var(--ed-seg-on-txt);
          border-color:transparent;
          box-shadow:0 6px 16px rgba(0,0,0,0.10);
        }

        .togrow{
          display:flex;
          align-items:center;
          justify-content:flex-end;
          gap:12px;
          min-width:0;
          flex:0 0 auto;
          white-space:nowrap;
        }

        .barrow{
          display:grid;
          gap:10px;
          min-width:0;
        }

        .barrow-top{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
        }

        .pillval{
          min-width:56px;
          text-align:center;
          padding:6px 10px;
          border-radius:var(--ed-radius-pill);
          background:var(--ed-pill-bg);
          border:1px solid var(--ed-pill-border);
          font-size:12px;
          font-weight:1000;
          color:var(--ed-pill-txt);
          box-shadow:0 1px 0 rgba(255,255,255,0.03) inset;
        }

        .muted{
          opacity:var(--ed-muted);
        }

        .hint{
          margin:2px 0 0 0;
          font-size:12px;
          opacity:0.92;
          color:var(--ed-text2);
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
        }

        .hint ha-icon{
          --mdc-icon-size:14px;
          color:var(--ed-text2);
        }

        .hint a{
          color:var(--primary-color);
          text-decoration:none;
          font-weight:700;
        }

        .hint a:hover{
          text-decoration:underline;
        }

        .chip-grid{
          display:grid;
          grid-template-columns:repeat(3, minmax(0, 1fr));
          gap:10px;
          margin-top:4px;
        }

        .objchip{
          display:grid;
          grid-template-columns:36px 1fr auto;
          align-items:center;
          column-gap:10px;
          width:100%;
          min-height:44px;
          padding:0 10px;
          border-radius:12px;
          border:1px solid var(--ed-chip-border);
          background:var(--ed-chip-bg);
          color:var(--ed-chip-txt);
          cursor:pointer;
          transition:
            background 0.18s ease,
            border-color 0.18s ease,
            color 0.18s ease,
            transform 0.18s ease,
            box-shadow 0.18s ease;
          box-sizing:border-box;
          font-size:13px;
          font-weight:900;
          text-align:left;
          box-shadow:0 1px 0 rgba(255,255,255,0.03) inset;
        }

        .objchip:hover{
          transform:translateY(-1px);
        }

        .objchip.on{
          background:var(--ed-chip-on-bg);
          border-color:var(--ed-chip-on-border);
          color:var(--ed-chip-on-txt);
          box-shadow:0 8px 18px rgba(0,0,0,0.08);
        }

        .objchip.disabled{
          opacity:var(--ed-chip-disabled);
          cursor:not-allowed;
          transform:none;
        }

        .objchip-icon{
          width:36px;
          height:36px;
          min-width:36px;
          border-radius:999px;
          display:grid;
          place-items:center;
          background:var(--ed-chip-icon-bg);
          transition:background 0.18s ease;
        }

        .objchip.on .objchip-icon{
          background:var(--ed-chip-on-icon-bg);
          color:inherit;
        }

        .objchip-icon ha-icon{
          --mdc-icon-size:18px;
          color:inherit;
          width:18px;
          height:18px;
          display:block;
        }

        .objchip-label{
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
          color:inherit;
        }

        .objchip-check{
          width:18px;
          height:18px;
          opacity:0;
          transform:scale(0.8);
          transition:opacity 0.16s ease, transform 0.16s ease;
          color:inherit;
        }

        .objchip.on .objchip-check{
          opacity:1;
          transform:scale(1);
        }

        .objchip-check ha-icon{
          --mdc-icon-size:18px;
          width:18px;
          height:18px;
        }

        .objmeta{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
          margin-top:2px;
        }

        .countpill{
          display:inline-flex;
          align-items:center;
          gap:6px;
          padding:6px 10px;
          border-radius:var(--ed-radius-pill);
          background:var(--ed-input-bg);
          border:1px solid var(--ed-input-border);
          color:var(--ed-text);
          font-size:11px;
          font-weight:950;
          letter-spacing:0.02em;
        }

        @media (max-width:900px){
          .tabbar{
            grid-template-columns:repeat(2,minmax(0,1fr));
          }
        }

        @media (max-width:640px){
          .row-head{
            align-items:stretch;
            flex-direction:column;
          }

          .togrow{
            justify-content:space-between;
            width:100%;
          }

          .panelhead{
            gap:12px;
          }

          .panelicon{
            width:38px;
            height:38px;
            min-width:38px;
          }
        }
      </style>

      <div class="wrap" style="${rootVars}">
        <div class="tabs">
          <div class="tabbar">
            ${tabBtn("general", "General", "mdi:cog-outline")}
            ${tabBtn("viewer", "Viewer", "mdi:image-outline")}
            ${tabBtn("live", "Live", "mdi:video-outline")}
            ${tabBtn("thumbs", "Thumbnails", "mdi:view-grid-outline")}
          </div>

          ${
            this._activeTab === "general"
              ? `
            <div class="tabpanel" data-panel="general">
              ${panelHead(
                "mdi:cog-outline",
                "General"
              )}

              <div class="row">
                <div class="lbl">Source mode</div>
                <div class="segwrap">
                  <button class="seg ${sensorModeOn ? "on" : ""}" data-src="sensor">File sensor</button>
                  <button class="seg ${mediaModeOn ? "on" : ""}" data-src="media">Media folders</button>
                </div>
              </div>

              <div class="row ${sensorModeOn ? "" : "muted"}">
                <div class="lbl">File sensors</div>
                <div class="desc">Enter <b>one</b> sensor per line</div>

                <div class="field" id="entities-field">
                  <textarea
                    id="entities"
                    rows="4"
                    ${sensorModeOn ? "" : "disabled"}
                    placeholder="sensor.gallery_auto&#10;sensor.gallery_muis"
                  ></textarea>
                  <div class="suggestions" id="entities-suggestions" hidden></div>
                </div>

                ${
                  invalidEntities.length
                    ? `<div class="desc">⚠️ Invalid / missing sensor(s): <code>${invalidEntities.join(
                        "</code>, <code>"
                      )}</code></div>`
                    : ``
                }
              </div>

              <div class="row ${mediaModeOn ? "" : "muted"}">
                <div class="lbl">Media folders</div>
                <div class="desc">Enter <strong>one</strong> folder per line</div>

                <div class="field" id="mediasources-field">
                  <textarea
                    id="mediasources"
                    rows="4"
                    placeholder="media-source://frigate/frigate/event-search/clips"
                    ${mediaModeOn ? "" : "disabled"}
                  ></textarea>
                  <div class="suggestions" id="mediasources-suggestions" hidden></div>
                </div>

                ${
                  mediaHasFile
                    ? `<div class="desc">⚠️ One of your entries looks like a file (extension). This field expects folders.</div>`
                    : ``
                }
              </div>

              <div class="row">
                <div class="lbl">Filename datetime format</div>
                <div class="desc">
                  Optional custom parser for date and time found in filenames.
                </div>

                <ha-textfield
                  id="filenamefmt"
                  label="Filename datetime format"
                  placeholder="YYYYMMDDHHmmss"
                ></ha-textfield>

                <div class="hint">
                  <ha-icon icon="mdi:information-outline"></ha-icon>
                  Examples:
                  <code>YYYYMMDDHHmmss</code>,
                  <code>DD-MM-YYYY_HH-mm-ss</code>,
                  <code>YYYY-MM-DDTHH:mm:ss</code>
                </div>
              </div>

              <div class="row">
                <div class="lbl">Delete service</div>
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
                  <select class="select ${deleteOk ? "" : "invalid"}" id="delservice">
                    ${
                      deleteChoices.length
                        ? `<option value=""></option>` +
                          deleteChoices
                            .map(
                              (id) =>
                                `<option value="${id}" ${id === deleteService ? "selected" : ""}>${id}</option>`
                            )
                            .join("")
                        : `<option value="" selected>(no shell_command services found)</option>`
                    }
                  </select>
                  <span class="selarrow"></span>
                </div>
              </div>
            </div>
          `
              : ``
          }

          ${
            this._activeTab === "viewer"
              ? `
            <div class="tabpanel" data-panel="viewer">
              ${panelHead(
                "mdi:image-outline",
                "Viewer"
              )}

              <div class="row">
                <div class="lbl">Height</div>
                <ha-textfield id="height" label="Height" type="number"></ha-textfield>
              </div>

              <div class="row">
                <div class="lbl">Position</div>
                <div class="segwrap">
                  <button class="seg ${previewPos === "top" ? "on" : ""}" data-ppos="top">Top</button>
                  <button class="seg ${previewPos === "bottom" ? "on" : ""}" data-ppos="bottom">Bottom</button>
                </div>
              </div>

              <div class="row">
                <div class="row-head">
                  <div>
                    <div class="lbl">Open-on-click</div>
                    <div class="desc">
                      Only show the main viewer after selecting a thumbnail. Click on the preview to close
                    </div>
                  </div>

                  <div class="togrow">
                    <ha-switch id="clicktoopen" ${clickToOpen ? "checked" : ""}></ha-switch>
                  </div>
                </div>
              </div>

              <div class="row">
                <div class="lbl">Preview bar position</div>
                <div class="segwrap">
                  <button class="seg ${tsPos === "top" ? "on" : ""}" data-pos="top">Top</button>
                  <button class="seg ${tsPos === "bottom" ? "on" : ""}" data-pos="bottom">Bottom</button>
                  <button class="seg ${tsPos === "hidden" ? "on" : ""}" data-pos="hidden">Hidden</button>
                </div>
              </div>

              <div class="row ${barDisabled ? "muted" : ""}">
                <div class="lbl">Preview bar opacity</div>
                <div class="barrow">
                  <div class="barrow-top">
                    <div class="pillval" id="barval">${barOpacity}%</div>
                  </div>
                  <ha-slider id="barop" min="0" max="100" step="1" ${barDisabled ? "disabled" : ""}></ha-slider>
                </div>
              </div>
            </div>
          `
              : ``
          }

          ${
            this._activeTab === "live"
              ? `
            <div class="tabpanel" data-panel="live">
              ${panelHead(
                "mdi:video-outline",
                "Live"
              )}

              <div class="row">
                <div class="row-head">
                  <div class="lbl">Live preview</div>

                  <div class="togrow">
                    <ha-switch id="liveenabled" ${liveEnabled ? "checked" : ""}></ha-switch>
                  </div>
                </div>

                <div class="desc">
                  Enable live camera mode inside the gallery preview
                </div>
              </div>

              ${
                liveEnabled
                  ? `
                <div class="row">
                  <div class="lbl">Camera entity</div>
                  <div class="desc">Select the camera entity used for live mode</div>

                  <div class="selectwrap">
                    <select class="select" id="livecam">
                      <option value=""></option>
                      ${cameraEntities
                        .map(
                          (id) =>
                            `<option value="${id}" ${
                              id === liveCameraEntity ? "selected" : ""
                            }>${id}</option>`
                        )
                        .join("")}
                    </select>
                    <span class="selarrow"></span>
                  </div>
                </div>

                <div class="row">
                  <div class="row-head">
                    <div>
                      <div class="lbl">Start in live mode</div>
                      <div class="desc">Open the card in live mode by default</div>
                    </div>

                    <div class="togrow">
                      <ha-switch id="livedefault" ${liveDefault ? "checked" : ""}></ha-switch>
                    </div>
                  </div>
                </div>
              `
                  : ``
              }
            </div>
          `
              : ``
          }

          ${
            this._activeTab === "thumbs"
              ? `
            <div class="tabpanel" data-panel="thumbs">
              ${panelHead(
                "mdi:view-grid-outline",
                "Thumbnails",
                "Control thumbnail layout, sizing, bar position, and which object filters are available."
              )}

              <div class="row">
                <div class="lbl">Thumbnail layout</div>
                <div class="desc">Choose how thumbnails are displayed inside the card</div>
                <div class="segwrap">
                  <button class="seg ${thumbLayout === "horizontal" ? "on" : ""}" data-tlayout="horizontal">Horizontal</button>
                  <button class="seg ${thumbLayout === "vertical" ? "on" : ""}" data-tlayout="vertical">Vertical</button>
                </div>
              </div>

              <div class="row ${thumbSizeMuted ? "muted" : ""}">
                <div class="lbl">Thumbnail size</div>
                <div class="desc">Set the size of each thumbnail in pixels</div>
                <ha-textfield
                  id="thumb"
                  label="Thumbnail size"
                  type="number"
                ></ha-textfield>
              </div>

              <div class="row">
                <div class="lbl">Maximum thumbnails shown</div>
                <div class="desc">Maximum number of media items loaded into the gallery</div>
                <ha-textfield
                  id="maxmedia"
                  label="Maximum thumbnails shown"
                  type="number"
                ></ha-textfield>
              </div>

              <div class="row">
                <div class="lbl">Thumbnail bar position</div>
                <div class="desc">Choose where the info bar on each thumbnail is shown</div>
                <div class="segwrap">
                  <button class="seg ${thumbBarPos === "top" ? "on" : ""}" data-tbpos="top">Top</button>
                  <button class="seg ${thumbBarPos === "bottom" ? "on" : ""}" data-tbpos="bottom">Bottom</button>
                  <button class="seg ${thumbBarPos === "hidden" ? "on" : ""}" data-tbpos="hidden">Hidden</button>
                </div>
              </div>

              <div class="row">
                <div class="lbl">Object filters</div>
                <div class="objmeta">
                  <div class="desc">Choose which filter chips are available on the card</div>
                  <div class="countpill">Selected ${selectedCount}/${MAX_VISIBLE_OBJECT_FILTERS}</div>
                </div>

                <div class="chip-grid">
                  ${AVAILABLE_OBJECT_FILTERS.map((obj) => {
                    const isOn = objectFiltersArr.includes(obj);
                    return `
                      <button
                        type="button"
                        class="objchip ${isOn ? "on" : ""}"
                        data-objchip="${obj}"
                        title="${this._objectLabel(obj)}"
                      >
                        <span class="objchip-icon">
                          <ha-icon icon="${this._objectIcon(obj)}"></ha-icon>
                        </span>
                        <span class="objchip-label">${this._objectLabel(obj)}</span>
                        <span class="objchip-check">
                          <ha-icon icon="mdi:check"></ha-icon>
                        </span>
                      </button>
                    `;
                  }).join("")}
                </div>
              </div>
            </div>
          `
              : ``
          }
        </div>
      </div>
    `;

    const $ = (id) => this.shadowRoot.getElementById(id);

    const entitiesEl = $("entities");
    const mediaEl = $("mediasources");
    const filenameFmtEl = $("filenamefmt");
    const delserviceEl = $("delservice");
    const heightEl = $("height");
    const thumbEl = $("thumb");
    const maxmediaEl = $("maxmedia");
    const baropEl = $("barop");
    const barvalEl = $("barval");
    const livecamEl = $("livecam");

    this._setControlValue(entitiesEl, entitiesText);
    this._setControlValue(mediaEl, mediaSourcesText);
    this._setControlValue(filenameFmtEl, filenameDatetimeFormat);
    this._setControlValue(heightEl, String(height));
    this._setControlValue(thumbEl, String(thumbSize));
    this._setControlValue(maxmediaEl, String(maxMedia));
    this._setControlValue(baropEl, barOpacity);

    if (delserviceEl) delserviceEl.value = deleteService;
    if (livecamEl) livecamEl.value = liveCameraEntity;

    this._applyFieldValidation("entities");
    this._applyFieldValidation("mediasources");

    this.shadowRoot.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => this._setActiveTab(btn.dataset.tab));
    });

    this.shadowRoot.querySelectorAll("[data-src]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("source_mode", btn.dataset.src)
      );
    });

    const bindTextarea = (id, commitFn) => {
      const el = $(id);
      if (!el) return;

      el.addEventListener("focus", () => {
        this._updateSuggestions(id);
      });

      el.addEventListener("input", () => {
        commitFn(false);
        this._applyFieldValidation(id);
        this._updateSuggestions(id);
      });

      el.addEventListener("change", () => {
        commitFn(true);
        this._applyFieldValidation(id);
        this._closeSuggestions(id);
      });

      el.addEventListener("blur", () => {
        setTimeout(() => {
          const active = this.shadowRoot?.activeElement;
          const suggBox = this.shadowRoot?.getElementById(`${id}-suggestions`);

          if (active && suggBox && suggBox.contains(active)) return;

          commitFn(true);
          this._applyFieldValidation(id);
          this._closeSuggestions(id);
        }, 120);
      });

      el.addEventListener("keydown", (e) => {
        const state = this._suggestState[id];

        if (state?.open && e.key === "ArrowDown") {
          e.preventDefault();
          this._moveSuggestion(id, 1);
          return;
        }

        if (state?.open && e.key === "ArrowUp") {
          e.preventDefault();
          this._moveSuggestion(id, -1);
          return;
        }

        if (state?.open && e.key === "Tab") {
          if (this._acceptSuggestion(id)) {
            e.preventDefault();
            return;
          }
        }

        if (state?.open && e.key === "Escape") {
          e.preventDefault();
          this._closeSuggestions(id);
          return;
        }
      });
    };

    bindTextarea("entities", this._commitEntities.bind(this));
    bindTextarea("mediasources", this._commitMediaSources.bind(this));

    this.shadowRoot.querySelectorAll("[data-objchip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._toggleObjectFilter(btn.dataset.objchip);
      });
    });

    const commitDeleteService = () => {
      const v = String(delserviceEl?.value || "").trim();

      if (!v) {
        const next = { ...this._config };
        delete next.delete_service;
        delete next.preview_close_on_tap;
        this._config = this._stripAlwaysTrueKeys(next);
        this._fire();
        this._scheduleRender();
        return;
      }

      this._set("delete_service", v);
    };

    delserviceEl?.addEventListener("change", commitDeleteService);

    const commitNumberField = (key, el, fallback, commit = false) => {
      const raw = String(el?.value ?? "").trim();

      if (raw === "") {
        if (commit) {
          this._set(key, fallback);
        } else {
          this._config = this._stripAlwaysTrueKeys({
            ...this._config,
            [key]: fallback,
          });
        }
        return;
      }

      const n = Number(raw);
      const v = Number.isFinite(n) ? n : fallback;

      if (commit) {
        this._set(key, v);
      } else {
        this._config = this._stripAlwaysTrueKeys({
          ...this._config,
          [key]: v,
        });
      }
    };

    const commitFilenameFormat = (commit = false) => {
      const raw = String(filenameFmtEl?.value ?? "").trim();

      if (!raw) {
        const next = { ...this._config };
        delete next.filename_datetime_format;
        this._config = this._stripAlwaysTrueKeys(next);

        if (commit) {
          this._fire();
          this._scheduleRender();
        }
        return;
      }

      this._config = this._stripAlwaysTrueKeys({
        ...this._config,
        filename_datetime_format: raw,
      });

      if (commit) {
        this._fire();
        this._scheduleRender();
      }
    };

    filenameFmtEl?.addEventListener("input", () => commitFilenameFormat(false));
    filenameFmtEl?.addEventListener("change", () => commitFilenameFormat(true));
    filenameFmtEl?.addEventListener("blur", () => commitFilenameFormat(true));

    heightEl?.addEventListener("input", () =>
      commitNumberField("preview_height", heightEl, 320, false)
    );
    heightEl?.addEventListener("change", () =>
      commitNumberField("preview_height", heightEl, 320, true)
    );
    heightEl?.addEventListener("blur", () =>
      commitNumberField("preview_height", heightEl, 320, true)
    );

    this.shadowRoot.querySelectorAll(".seg[data-ppos]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("preview_position", btn.dataset.ppos)
      );
    });

    thumbEl?.addEventListener("input", () =>
      commitNumberField("thumb_size", thumbEl, 140, false)
    );
    thumbEl?.addEventListener("change", () =>
      commitNumberField("thumb_size", thumbEl, 140, true)
    );
    thumbEl?.addEventListener("blur", () =>
      commitNumberField("thumb_size", thumbEl, 140, true)
    );

    const pushMaxMedia = (commit = false) => {
      const raw = String(maxmediaEl?.value ?? "").trim();

      if (raw === "") {
        if (commit) {
          this._set("max_media", 1);
        } else {
          this._config = this._stripAlwaysTrueKeys({
            ...this._config,
            max_media: 1,
          });
        }
        return;
      }

      const n = this._numInt(raw, 1);
      const v = this._clampInt(n, 1, 100);

      if (commit) {
        this._set("max_media", v);
      } else {
        this._config = this._stripAlwaysTrueKeys({
          ...this._config,
          max_media: v,
        });
      }
    };

    maxmediaEl?.addEventListener("input", () => pushMaxMedia(false));
    maxmediaEl?.addEventListener("change", () => pushMaxMedia(true));
    maxmediaEl?.addEventListener("blur", () => pushMaxMedia(true));

    this.shadowRoot.querySelectorAll(".seg[data-tbpos]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("thumb_bar_position", btn.dataset.tbpos)
      );
    });

    this.shadowRoot.querySelectorAll(".seg[data-tlayout]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("thumb_layout", btn.dataset.tlayout)
      );
    });

    $("clicktoopen")?.addEventListener("change", (e) => {
      this._set("preview_click_to_open", !!e.target.checked);
    });

    $("liveenabled")?.addEventListener("change", (e) => {
      const enabled = !!e.target.checked;

      if (enabled) {
        this._set("live_enabled", true);
        return;
      }

      const next = { ...this._config };
      delete next.live_default;
      delete next.live_camera_entity;
      delete next.live_enabled;
      delete next.live_provider;

      this._config = this._stripAlwaysTrueKeys(next);
      this._fire();
      this._scheduleRender();
    });

    livecamEl?.addEventListener("change", (e) => {
      const v = String(e.target.value || "").trim();
      if (!v) {
        const next = { ...this._config };
        delete next.live_camera_entity;
        this._config = this._stripAlwaysTrueKeys(next);
        this._fire();
        this._scheduleRender();
        return;
      }
      this._set("live_camera_entity", v);
    });

    $("livedefault")?.addEventListener("change", (e) => {
      this._set("live_default", !!e.target.checked);
    });

    this.shadowRoot.querySelectorAll(".seg[data-pos]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("bar_position", btn.dataset.pos)
      );
    });

    const updateBarVal = (v) => {
      if (barvalEl) barvalEl.textContent = `${v}%`;
    };

    baropEl?.addEventListener("input", (e) => {
      const v = Number(e.target.value);
      updateBarVal(v);
    });

    baropEl?.addEventListener("change", (e) => {
      const v = Number(e.target.value);
      updateBarVal(v);
      this._set("bar_opacity", Number.isFinite(v) ? v : 45);
    });

    try {
      const fs = this._focusState;
      if (fs && fs.id) {
        const el = $(fs.id);
        if (el && typeof el.focus === "function") {
          if (fs.value != null && typeof el.value === "string" && el.value !== fs.value) {
            el.value = fs.value;
          }

          el.focus({ preventScroll: true });

          if (
            fs.start != null &&
            fs.end != null &&
            typeof el.setSelectionRange === "function"
          ) {
            el.setSelectionRange(fs.start, fs.end);
          }
        }
      }
    } catch (_) {}

    this._renderSuggestions("entities");
    this._renderSuggestions("mediasources");
  }

  _renderSuggestions(id) {
    const box = this.shadowRoot?.getElementById(`${id}-suggestions`);
    if (!box) return;

    const state = this._suggestState[id] || { open: false, items: [], index: -1 };

    if (!state.open || !state.items.length) {
      box.innerHTML = "";
      box.hidden = true;
      return;
    }

    const activeItem =
      state.index >= 0 && state.items[state.index] ? state.items[state.index] : "";

    box.hidden = false;
    box.innerHTML = `
      <div class="sugg-label">Suggestions</div>
      ${state.items
        .map(
          (item, idx) => `
            <button
              type="button"
              class="sugg-item ${idx === state.index ? "active" : ""}"
              data-sugg-id="${id}"
              data-sugg-value="${item.replace(/"/g, "&quot;")}"
              title="${item.replace(/"/g, "&quot;")}"
            >
              ${item}
            </button>
          `
        )
        .join("")}
      ${
        activeItem
          ? `<div class="sugg-active-path">${activeItem}</div>`
          : ""
      }
    `;

    box.querySelectorAll("[data-sugg-id]").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this._applySuggestion(id, btn.dataset.suggValue || "");
      });
    });
  }

  _replaceCurrentLine(el, newLine) {
    const info = this._getTextareaLineInfo(el);
    const before = info.value.slice(0, info.lineStart);
    const after = info.value.slice(info.lineEnd);
    const nextValue = before + newLine + after;

    el.value = nextValue;

    const pos = before.length + newLine.length;
    try {
      el.setSelectionRange(pos, pos);
      el.focus({ preventScroll: true });
    } catch (_) {}
  }

  _scheduleRender() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this._render());
  }

  _set(key, value) {
    if (key === "live_provider") return;
    if (key === "preview_close_on_tap") return;

    this._config = { ...this._config, [key]: value };
    this._config = this._stripAlwaysTrueKeys(this._config);

    if (key !== "shell_command" && "shell_command" in this._config) {
      const next = { ...this._config };
      delete next.shell_command;
      this._config = next;
    }

    this._fire();
    this._scheduleRender();
  }

  _setActiveTab(tab) {
    this._activeTab = String(tab || "general");
    this._scheduleRender();
  }

  _setControlValue(el, value) {
    if (!el) return;
    try {
      el.value = value;
    } catch (_) {}
    try {
      if ("_value" in el) el._value = value;
    } catch (_) {}
  }

  setConfig(config) {
    this._config = this._stripAlwaysTrueKeys({ ...(config || {}) });

    if ("shell_command" in this._config) {
      const next = { ...this._config };
      delete next.shell_command;
      this._config = next;
    }

    try {
      const cfg = { ...(config || {}) };

      const normArr = (arr) =>
        (arr || [])
          .map(String)
          .map((s) => s.trim())
          .filter(Boolean);

      const entArr = Array.isArray(cfg.entities) ? cfg.entities : null;
      const singleEntity = String(cfg.entity || "").trim();

      const pickedEntities =
        (entArr && normArr(entArr)) || (singleEntity ? [singleEntity] : []);

      const hasEntities =
        Array.isArray(this._config.entities) && this._config.entities.length;

      if (
        !hasEntities &&
        pickedEntities.length &&
        ("entity" in cfg || singleEntity)
      ) {
        const next = { ...this._config, entities: pickedEntities };
        delete next.entity;
        this._config = this._stripAlwaysTrueKeys(next);
        this._fire();
      }

      const msArr = Array.isArray(cfg.media_sources) ? cfg.media_sources : null;
      const favArr = Array.isArray(cfg.media_folders_fav)
        ? cfg.media_folders_fav
        : null;
      const single = String(cfg.media_source || "").trim();

      const pickedMedia =
        (msArr && normArr(msArr)) ||
        (favArr && normArr(favArr)) ||
        (single ? [single] : []);

      const hasMediaSources =
        Array.isArray(this._config.media_sources) &&
        this._config.media_sources.length;

      const hasLegacyMedia =
        "media_folder_favorites" in cfg ||
        "media_folders_fav" in cfg ||
        "media_source" in cfg;

      if (
        !hasMediaSources &&
        pickedMedia.length &&
        (hasLegacyMedia || single)
      ) {
        const next = { ...this._config, media_sources: pickedMedia };
        delete next.media_folder_favorites;
        delete next.media_folders_fav;
        delete next.media_source;
        this._config = this._stripAlwaysTrueKeys(next);
        this._fire();
      }

      const rawObjectFilters = Array.isArray(cfg.object_filters)
        ? cfg.object_filters
        : String(cfg.object_filters || "").trim()
          ? [cfg.object_filters]
          : [];

      const normObjectFilters = this._normalizeObjectFilters(rawObjectFilters);
      const currentObjectFilters = Array.isArray(this._config.object_filters)
        ? this._normalizeObjectFilters(this._config.object_filters)
        : [];

      if (
        JSON.stringify(normObjectFilters) !==
        JSON.stringify(currentObjectFilters)
      ) {
        const next = { ...this._config };
        if (normObjectFilters.length) next.object_filters = normObjectFilters;
        else delete next.object_filters;
        this._config = this._stripAlwaysTrueKeys(next);
        this._fire();
      }

      const thumbLayout = String(cfg.thumb_layout || "").toLowerCase().trim();
      if (thumbLayout === "horizontal" || thumbLayout === "vertical") {
        if (this._config.thumb_layout !== thumbLayout) {
          this._config = this._stripAlwaysTrueKeys({
            ...this._config,
            thumb_layout: thumbLayout,
          });
          this._fire();
        }
      }
    } catch (_) {}

    this._scheduleRender();
  }

  set hass(hass) {
    this._hass = hass;

    const ae = this.shadowRoot?.activeElement;
    const interacting =
      ae &&
      (ae.id === "barop" ||
        ae.id === "delservice" ||
        ae.id === "entities" ||
        ae.id === "filenamefmt" ||
        ae.id === "height" ||
        ae.id === "livecam" ||
        ae.id === "maxmedia" ||
        ae.id === "mediasources" ||
        ae.id === "thumb") &&
      ae.matches(":focus");

    if (interacting) return;

    this._scheduleRender();
  }

  _sortUniqueStrings(arr) {
    const out = [];
    const seen = new Set();
    for (const v of arr || []) {
      const s = String(v || "").trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }

  _sourcesToText(arr) {
    const list = Array.isArray(arr)
      ? arr.map(String).map((s) => s.trim()).filter(Boolean)
      : [];
    return list.join("\n");
  }

  _stripAlwaysTrueKeys(cfg) {
    const next = { ...(cfg || {}) };

    if ("filter_folders_enabled" in next) delete next.filter_folders_enabled;
    if ("live_provider" in next) delete next.live_provider;
    if ("media_folder_favorites" in next) delete next.media_folder_favorites;
    if ("media_folder_filter" in next) delete next.media_folder_filter;
    if ("media_folders_fav" in next) delete next.media_folders_fav;
    if ("preview_close_on_tap" in next) delete next.preview_close_on_tap;

    return next;
  }

  _toRel(media_content_id) {
    return String(media_content_id || "")
      .replace(/^media-source:\/\/media_source\//, "")
      .replace(/^media-source:\/\/media_source/, "")
      .replace(/^media-source:\/\//, "")
      .replace(/^\/+/, "")
      .trim();
  }

  _toggleObjectFilter(value) {
    const v = String(value || "").toLowerCase().trim();
    if (!v) return;
    if (!AVAILABLE_OBJECT_FILTERS.includes(v)) return;

    const current = this._normalizeObjectFilters(
      this._config.object_filters || []
    );
    const set = new Set(current);

    if (set.has(v)) {
      set.delete(v);
    } else {
      set.add(v);
    }

    const nextArr = Array.from(set);
    const next = { ...this._config };

    if (nextArr.length) next.object_filters = nextArr;
    else delete next.object_filters;

    this._config = this._stripAlwaysTrueKeys(next);
    this._fire();
    this._scheduleRender();
  }

  async _updateSuggestions(id) {
    const el = this.shadowRoot?.getElementById(id);
    if (!el) return;

    const info = this._getTextareaLineInfo(el);
    const query = String(info.line || "").trim();

    if (id === "entities") {
      const source = this._collectEntitySuggestions();
      const items = this._filterSuggestions(source, query).filter(
        (v) => String(v).trim() !== query
      );

      const fingerprint = JSON.stringify(items);
      if (this._lastSuggestFingerprint[id] === fingerprint) return;
      this._lastSuggestFingerprint[id] = fingerprint;

      if (!items.length) {
        this._closeSuggestions(id);
        return;
      }

      this._openSuggestions(id, items);
      return;
    }

    if (id === "mediasources") {
      clearTimeout(this._mediaSuggestTimer);

      this._mediaSuggestTimer = setTimeout(async () => {
        const reqId = ++this._mediaSuggestReq;
        const items = (await this._collectMediaSuggestionsDynamic(query)).filter(
          (v) => String(v).trim() !== query
        );

        if (reqId !== this._mediaSuggestReq) return;

        const fingerprint = JSON.stringify(items);
        if (this._lastSuggestFingerprint[id] === fingerprint) return;
        this._lastSuggestFingerprint[id] = fingerprint;

        if (!items.length) {
          this._closeSuggestions(id);
          return;
        }

        this._openSuggestions(id, items);
      }, 120);
    }
  }

  _validateMediaFolders(raw) {
    if (!raw) return "neutral";

    const lines = raw
      .split(/\n|,/g)
      .map((v) => v.trim())
      .filter(Boolean);

    if (!lines.length) return "neutral";

    for (const path of lines) {
      if (!path.startsWith("media-source://")) return "invalid";
      if (/\.(jpg|jpeg|png|mp4|mov|mkv|avi|json|txt)$/i.test(path)) {
        return "invalid";
      }
    }

    return "valid";
  }

  _validateSensors(raw) {
    if (!raw) return "neutral";

    const lines = raw
      .split(/\n|,/g)
      .map((v) => v.trim())
      .filter(Boolean);

    if (!lines.length) return "neutral";

    for (const id of lines) {
      if (!id.startsWith("sensor.")) return "invalid";
      if (!this._hass?.states?.[id]) return "invalid";
    }

    return "valid";
  }
}

if (!customElements.get("camera-gallery-card-editor")) {
  customElements.define("camera-gallery-card-editor", CameraGalleryCardEditor);
}
