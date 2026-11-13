/**
 * Visual editor for Camera Gallery Card (camera-gallery-card-editor).
 * Moved out of index.js unchanged.
 */

import { dump as yamlDump } from "js-yaml";
import { STYLE_SECTIONS } from "../config/styling-config";
import { migrateLegacyKeys } from "../config/normalize";
import { objectIcon } from "../data/object-filters";
import { collectMediaSamples, scoreSamples } from "../data/path-format-detect";
import { entityDisplayName, entitySearchText } from "../util/entity-name";
import { defaultEntityIcon, iconAfterEntityChange } from "../util/entity-icon";
import {
  getEditorCameraEntities,
  getLiveCameraEntityIds,
  hasAnyMicStream,
  micStreamForCamera,
} from "../data/live-config";
import { normalizeRotation } from "../data/live-rotation";
import {
  GALLERY_PILL_CATALOG,
  LIVE_PILL_CATALOG,
  TOOLBAR_CATALOG,
  resolvePillSettings,
  sortPillsByOrder,
} from "../data/pill-catalog";
import { itemKey, liveControlZones, zonesToConfig } from "../data/live-controls-layout";
import { detectPtzType, detectPtzButtons } from "../data/ptz";
import { hasFrigateConfig, isFrigateRecordingsRoot, isFrigateRoot } from "../util/frigate";
import {
  AVAILABLE_OBJECT_FILTERS,
  DEFAULT_AUTOMUTED,
  DEFAULT_AUTOPLAY,
  DEFAULT_LIVE_AUTO_MUTED,
  DEFAULT_LIVE_GRID_EMPHASIS,
  DEFAULT_THUMBNAIL_FRAME_PCT,
  MAX_VISIBLE_OBJECT_FILTERS,
} from "../const";
import { svgIcon } from "../ui/icons";
import { sortConfigKeysForOutput } from "../config/key-order";
import { EDITOR_CSS } from "./editor-styles";
import { wireDragSort } from "./drag-sort";

class CameraGalleryCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this.attachShadow({ mode: "open" });

    this._scrollRestore = {
      windowY: 0,
      hostScrollTop: 0,
      browserBodyTop: 0,
    };

    this._activeTab = "source";
    // Open/closed state for v2 collapsibles, keyed `${tab}.${sectionId}`.
    // Persisted to localStorage so it survives editor close / page reload.
    this._v2OpenSections = (() => {
      try {
        const raw = (typeof localStorage !== "undefined") && localStorage.getItem("cgc_v2_open_sections");
        if (raw) return new Map(Object.entries(JSON.parse(raw)));
      } catch (_) { /* ignore */ }
      return new Map();
    })();
    // UI-only override that bypasses the PTZ auto-detect filter in the
    // Live tab. Lives on the editor instance, not in config — flipping it
    // shouldn't dirty the saved YAML.
    this._ptzShowAll = false;
    this._focusState = null;
    this._lastSuggestFingerprint = {
      entities: "",
      mediasources: "",
    };
    this._mediaBrowseCache = new Map();
    this._mediaSuggestReq = 0;
    this._mediaSuggestTimer = null;
    this._raf = null;

    // Path-format auto-detection state. The result holds the full
    // scored list so the editor can render an expandable scoreboard
    // (winner + match counts for every tested candidate). `_detectKey`
    // fingerprints the inputs (roots + entities) so a click on a
    // already-up-to-date result is cheap. `_detectStatus` carries
    // user-facing messaging (e.g. "Frigate-only — no format needed").
    this._detectResult = null;
    this._detectStatus = "";
    this._detectKey = "";
    this._detectInFlight = false;

    this._mediaBrowserOpen = false;
    this._mediaBrowserLoading = false;
    this._mediaBrowserPath = "";
    this._mediaBrowserItems = [];
    this._mediaBrowserHistory = [];

    this._suggestState = {
      entities: { open: false, items: [], index: -1 },
      mediasources: { open: false, items: [], index: -1 },
    };

    this._openStyleSections = new Set();

    this._wizardOpen = false;
    this._wizardFolder = "";
    this._wizardName = "";
    this._wizardStatus = null;


    this._editorRendered = false;
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

  async _browseMediaFolderNodes(mediaContentId) {
    const isRoot = mediaContentId === null || mediaContentId === "" || mediaContentId == null;
    const id = isRoot ? null : this._normalizeMediaSourceValue(mediaContentId);
    if (!isRoot && (id === null || id === undefined)) return [];
    if (!this._hass?.callWS) return [];

    const cacheKey = `__nodes__:${isRoot ? "__root__" : id}`;
    if (this._mediaBrowseCache.has(cacheKey)) {
      return this._mediaBrowseCache.get(cacheKey);
    }

    try {
      const wsPayload = { type: "media_source/browse_media" };
      if (!isRoot) wsPayload.media_content_id = id;
      const result = await this._hass.callWS(wsPayload);

      const children = Array.isArray(result?.children) ? result.children : [];

      const folders = children
        .filter((child) => this._isFolderNode(child))
        .map((child) => {
          const mediaId = String(child.media_content_id || "").trim();
          const title = String(child.title || "").trim();
          return {
            id: mediaId,
            title: title || this._lastPathSegment(mediaId),
          };
        })
        .filter((v) => v.id.startsWith("media-source://"))
        .sort((a, b) => a.title.localeCompare(b.title));

      this._mediaBrowseCache.set(cacheKey, folders);
      return folders;
    } catch (_) {
      this._mediaBrowseCache.set(cacheKey, []);
      return [];
    }
  }

  _getHostScroller() {
    let el = this;
    while (el) {
      const root = el.getRootNode?.();
      const parent = el.parentElement || (root && root.host ? root.host : null);

      if (!parent) break;

      try {
        const style = getComputedStyle(parent);
        const overflowY = style.overflowY;
        const canScroll =
          (overflowY === "auto" || overflowY === "scroll") &&
          parent.scrollHeight > parent.clientHeight;

        if (canScroll) return parent;
      } catch (_) {}

      el = parent;
    }

    return null;
  }

  _captureScrollState() {
    try {
      this._scrollRestore.windowY =
        window.scrollY ||
        window.pageYOffset ||
        document.documentElement.scrollTop ||
        0;
    } catch (_) {
      this._scrollRestore.windowY = 0;
    }

    try {
      const scroller = this._getHostScroller();
      this._scrollRestore.hostScrollTop = scroller ? scroller.scrollTop : 0;
    } catch (_) {
      this._scrollRestore.hostScrollTop = 0;
    }

    try {
      const body = this.shadowRoot?.querySelector(".browser-body");
      this._scrollRestore.browserBodyTop = body ? body.scrollTop : 0;
    } catch (_) {
      this._scrollRestore.browserBodyTop = 0;
    }
  }

  _restoreScrollState() {
    requestAnimationFrame(() => {
      try {
        const scroller = this._getHostScroller();
        if (scroller) {
          scroller.scrollTop = this._scrollRestore.hostScrollTop || 0;
        } else {
          window.scrollTo({
            top: this._scrollRestore.windowY || 0,
            behavior: "auto",
          });
        }
      } catch (_) {}

      try {
        const body = this.shadowRoot?.querySelector(".browser-body");
        if (body) {
          body.scrollTop = this._scrollRestore.browserBodyTop || 0;
        }
      } catch (_) {}
    });
  }

  _lockPageScroll() {
    this._captureScrollState();

    const body = document.body;
    const docEl = document.documentElement;

    if (body) {
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
    }

    if (docEl) {
      docEl.style.overflow = "hidden";
    }
  }

  _unlockPageScroll() {
    const body = document.body;
    const docEl = document.documentElement;

    if (body) {
      body.style.overflow = "";
      body.style.touchAction = "";
    }

    if (docEl) {
      docEl.style.overflow = "";
    }

    this._restoreScrollState();
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
        detail: { config: sortConfigKeysForOutput(this._config) },
        bubbles: true,
        composed: true,
      })
    );
  }

  _getDefaultMediaSuggestions() {
    const defaults = [
      "media-source://frigate",
      "media-source://frigate/frigate/event-search/clips",
      "media-source://frigate/frigate/event-search/snapshots",
      "media-source://media_source",
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

  _getMediaBrowserRoots() {
    const roots = [
      "media-source://frigate",
      "media-source://media_source",
      "media-source://media_source/local",
    ];

    const configured = Array.isArray(this._config.media_sources)
      ? this._config.media_sources
          .map((x) => this._normalizeMediaSourceValue(x))
          .filter(Boolean)
      : [];

    return this._sortUniqueStrings([...roots, ...configured]);
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

  _looksLikeFile(relPath) {
    const v = String(relPath || "");
    if (v.startsWith("media-source://")) return false;
    const last = v.split("/").pop() || "";
    return /\.(jpg|jpeg|png|gif|webp|mp4|mov|mkv|avi|m4v|wav|mp3|aac|flac|pdf|txt|json)$/i.test(
      last
    );
  }

  _lastPathSegment(v) {
    const s = String(v || "").replace(/\/+$/, "");
    if (!s) return "";
    const parts = s.split("/");
    return parts[parts.length - 1] || s;
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
      const arr = Array.isArray(listOrSingle) ? listOrSingle : (listOrSingle ? [listOrSingle] : []);
      const out = [];
      const seen = new Set();

      for (const item of arr) {
        let key = "";
        if (typeof item === "string") {
          key = item.toLowerCase().trim();
        } else if (typeof item === "object" && item !== null) {
          // `noUncheckedIndexedAccess`-safe — an empty `{}` would otherwise
          // throw on `.toLowerCase()`. The `if (!key …)` below drops it.
          key = (Object.keys(item)[0] || "").toLowerCase().trim();
        }

        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(item); // Keep the original item (string or object)
      }
      return out;
    }

  _numInt(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.round(n);
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

  async _openMediaBrowser(startPath = "") {
    const roots = this._getMediaBrowserRoots();

    const wantsRoot = startPath === "" || startPath == null;
    const chosen = wantsRoot ? "" : (this._normalizeMediaSourceValue(startPath) || roots[0] || "");

    this._lockPageScroll();

    this._mediaBrowserOpen = true;
    this._mediaBrowserHistory = [];
    this._mediaBrowserItems = [];
    this._mediaBrowserPath = chosen;
    this._mediaBrowserLoading = true;
    this._scheduleRender();

    await this._loadMediaBrowser(chosen, false);
  }

  async _loadMediaBrowser(path, pushHistory = true) {
    const target = path === null ? null : (path === "" ? "" : this._normalizeMediaSourceValue(path));
    if (target === null || target === undefined) return;

    if (
      pushHistory &&
      this._mediaBrowserPath !== target
    ) {
      this._mediaBrowserHistory.push(this._mediaBrowserPath);
    }

    this._mediaBrowserLoading = true;
    this._mediaBrowserPath = target;
    this._mediaBrowserItems = [];
    this._scheduleRender();

    const items = await this._browseMediaFolderNodes(target);

    if (this._mediaBrowserPath !== target) return;

    this._mediaBrowserItems = items;
    this._mediaBrowserLoading = false;
    this._scheduleRender();
  }

  _closeMediaBrowser() {
    this._unlockPageScroll();

    this._mediaBrowserOpen = false;
    this._mediaBrowserLoading = false;
    this._mediaBrowserPath = "";
    this._mediaBrowserItems = [];
    this._mediaBrowserHistory = [];
    this._scheduleRender();
  }

  // ─── Live-camera crop editor (visual tool) ───────────────────────

  /**
   * Render the per-camera inline crop tool inside a livecam-row body.
   *
   * No modal: the editor lives directly in the row so the user edits in
   * place. State is read from the saved config; user interactions
   * (drag, aspect change, reset) commit straight back via `_set`. The
   * source aspect ratio is detected from the snapshot's natural dimensions
   * the first time the img loads — re-rendering picks up the persisted
   * `source_ar` so detection only runs once per camera.
   */
  _renderLivecamCropInline(cameraId) {
    const crop = this._liveCameraEntry(cameraId)?.crop || {};
    const x = Number.isFinite(Number(crop.x)) ? Number(crop.x) : 0;
    const y = Number.isFinite(Number(crop.y)) ? Number(crop.y) : 0;
    const w = Number.isFinite(Number(crop.w)) && crop.w > 0 ? Number(crop.w) : 100;
    const h = Number.isFinite(Number(crop.h)) && crop.h > 0 ? Number(crop.h) : 100;
    const cropOn = !(x === 0 && y === 0 && w === 100 && h === 100);
    const isOpen = this._livecamCropOpen?.has?.(cameraId) === true;
    const status = cropOn
      ? `${Math.round(w)} × ${Math.round(h)} %`
      : "Off";
    const header = `
      <button type="button" class="livecam-crop-toggle ${cropOn ? "set" : ""}" data-cropcam-toggle="${cameraId}">
        ${svgIcon('mdi:crop', 14)}
        <span class="livecam-crop-toggle-label">Crop view</span>
        <span class="livecam-crop-toggle-status">${status}</span>
        <span class="livecam-crop-toggle-chev">${isOpen ? "▾" : "▸"}</span>
      </button>
    `;
    if (!isOpen) {
      return `<div class="livecam-crop-section" data-cropcam-section="${cameraId}">${header}</div>`;
    }
    // Prefer the persisted source_ar; fall back to whatever the editor
    // detected from the snapshot during this session. Without this fallback
    // a Reset (which deletes the crop entirely) would lose the 4:3 label
    // until the user opens the row again.
    const sourceAR = String(
      crop.source_ar || this._livecamCropDetectedAR?.get(cameraId) || "16/9"
    );
    const camState = this._hass?.states?.[cameraId];
    const sig = String(camState?.attributes?.entity_picture || "");
    // Stable cache key — only changes when the camera state actually
    // updates (new frame, new auth signature). Re-renders triggered by
    // editor saves keep the same URL so the browser uses the cached
    // image instead of refetching and flickering.
    const cacheKey = String(camState?.last_changed || "")
      .replace(/[^0-9]/g, "")
      .slice(0, 14);
    const imgUrl = sig
      ? sig + (sig.includes("?") ? "&" : "?") + "k=" + cacheKey
      : "";
    const aspectLock = this._livecamCropAspect?.get(cameraId) || "source";
    const srcLabel = sourceAR.replace("/", ":");
    return `
      <div class="livecam-crop-section open" data-cropcam-section="${cameraId}">
        ${header}
        <div class="livecam-crop-inline" data-cropcam-root="${cameraId}">
          <div class="livecam-crop-head">
            <select class="livecam-crop-aspect" data-cropcam-aspect="${cameraId}">
            <option value="source" ${aspectLock === "source" ? "selected" : ""}>${srcLabel} (Source)</option>
            <option value="16/9"   ${aspectLock === "16/9"   ? "selected" : ""}>16:9</option>
            <option value="4/3"    ${aspectLock === "4/3"    ? "selected" : ""}>4:3</option>
            <option value="1/1"    ${aspectLock === "1/1"    ? "selected" : ""}>1:1</option>
            <option value="9/16"   ${aspectLock === "9/16"   ? "selected" : ""}>9:16</option>
            <option value="3/4"    ${aspectLock === "3/4"    ? "selected" : ""}>3:4</option>
            <option value="free"   ${aspectLock === "free"   ? "selected" : ""}>Free</option>
          </select>
          <button type="button" class="livecam-crop-reset" data-cropcam-reset="${cameraId}" title="Reset to full frame">
            ${svgIcon('mdi:fullscreen', 12)}<span>Reset</span>
          </button>
        </div>
        <div class="livecam-crop-stage" data-cropcam-stage="${cameraId}">
          ${imgUrl
            ? `<img class="livecam-crop-img" data-cropcam-img="${cameraId}" src="${imgUrl}" alt="" draggable="false" />`
            : `<div class="livecam-crop-empty">Camera snapshot unavailable</div>`}
          <div class="livecam-crop-rect" data-cropcam-rect="${cameraId}"
               style="left:${x}%;top:${y}%;width:${w}%;height:${h}%;">
            <div class="livecam-crop-handle h-tl" data-handle="tl"></div>
            <div class="livecam-crop-handle h-tr" data-handle="tr"></div>
            <div class="livecam-crop-handle h-bl" data-handle="bl"></div>
            <div class="livecam-crop-handle h-br" data-handle="br"></div>
          </div>
          <div class="livecam-crop-mask top"    style="height:${y}%;"></div>
          <div class="livecam-crop-mask bottom" style="top:${y + h}%;"></div>
          <div class="livecam-crop-mask left"   style="top:${y}%;width:${x}%;height:${h}%;"></div>
          <div class="livecam-crop-mask right"  style="top:${y}%;left:${x + w}%;height:${h}%;"></div>
        </div>
        <div class="livecam-crop-info" data-cropcam-info="${cameraId}">
          x: <strong>${Math.round(x)}%</strong> · y: <strong>${Math.round(y)}%</strong> ·
          w: <strong>${Math.round(w)}%</strong> · h: <strong>${Math.round(h)}%</strong>
        </div>
        </div>
      </div>
    `;
  }

  /**
   * Persist a crop update for one camera. Full-frame writes delete the
   * `crop` key so the YAML stays clean; otherwise the rounded percentage
   * box + the detected source aspect are stored.
   */
  _saveCropForCamera(cameraId, next) {
    if (!cameraId) return;
    const fullFrame = next.x === 0 && next.y === 0 && next.w === 100 && next.h === 100;
    let cropOut;
    if (!fullFrame) {
      cropOut = {
        x: Math.round(next.x),
        y: Math.round(next.y),
        w: Math.round(next.w),
        h: Math.round(next.h),
      };
      if (next.source_ar && next.source_ar !== "16/9") {
        cropOut.source_ar = next.source_ar;
      }
    }
    this._updateLiveCamera(cameraId, { crop: cropOut }, { render: true });
  }

  _resetCropForCamera(cameraId) {
    this._saveCropForCamera(cameraId, { x: 0, y: 0, w: 100, h: 100 });
  }

  /**
   * Wire pointer + select interactions for every inline crop tool rendered
   * in the editor. Called once per editor render. State during drag lives
   * in closure variables; pointer-up writes the final rectangle straight
   * to config, which re-renders the row with the new values.
   *
   * For each camera stage:
   *  - Pointer-down on a corner handle → resize that corner
   *  - Pointer-down on the rect body → move whole rect
   *  - Aspect select → snap rect to the chosen ratio + persist
   *  - Reset → write full-frame back to config
   *  - img.onload → detect source aspect ratio + update the "Source" label
   */
  _wireLivecamCropInline() {
    const root = this.shadowRoot;
    if (!root) return;
    if (!this._livecamCropAspect) this._livecamCropAspect = new Map();
    if (!this._livecamCropDetectedAR) this._livecamCropDetectedAR = new Map();
    if (!this._livecamCropOpen) this._livecamCropOpen = new Set();

    // Toggle the collapsible per camera. Clicking the header swaps the
    // section between collapsed (just the row) and expanded (full tool).
    root.querySelectorAll("[data-cropcam-toggle]").forEach((btn) => {
      if (btn.dataset.cropcamWiredToggle === "1") return;
      btn.dataset.cropcamWiredToggle = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.cropcamToggle;
        if (!id) return;
        if (this._livecamCropOpen.has(id)) this._livecamCropOpen.delete(id);
        else this._livecamCropOpen.add(id);
        this._scheduleRender();
      });
    });

    root.querySelectorAll("[data-cropcam-stage]").forEach((stage) => {
      const cameraId = stage.dataset.cropcamStage;
      if (!cameraId || stage.dataset.cropcamWired === "1") return;
      stage.dataset.cropcamWired = "1";
      this._wireOneInlineCropStage(stage, cameraId);
    });
  }

  _wireOneInlineCropStage(stage, cameraId) {
    const root = this.shadowRoot;
    if (!root) return;

    // Refs scoped to this stage so the multi-row case stays clean.
    const rectEl = stage.querySelector(`[data-cropcam-rect="${cameraId}"]`);
    const maskTop = stage.querySelector(".livecam-crop-mask.top");
    const maskBottom = stage.querySelector(".livecam-crop-mask.bottom");
    const maskLeft = stage.querySelector(".livecam-crop-mask.left");
    const maskRight = stage.querySelector(".livecam-crop-mask.right");
    const infoEl = root.querySelector(`[data-cropcam-info="${cameraId}"]`);
    const aspectSel = root.querySelector(`[data-cropcam-aspect="${cameraId}"]`);
    const resetBtn = root.querySelector(`[data-cropcam-reset="${cameraId}"]`);
    const imgEl = stage.querySelector(`[data-cropcam-img="${cameraId}"]`);

    if (!rectEl) return;

    // Read current crop from the rect's inline style (single source of
    // truth during drag) so closure state stays in sync with the DOM.
    const readRect = () => ({
      x: parseFloat(rectEl.style.left) || 0,
      y: parseFloat(rectEl.style.top) || 0,
      w: parseFloat(rectEl.style.width) || 100,
      h: parseFloat(rectEl.style.height) || 100,
    });

    const getSavedSourceAR = () => {
      return String(this._liveCameraEntry(cameraId)?.crop?.source_ar || this._livecamCropDetectedAR.get(cameraId) || "16/9");
    };

    const sourceARNum = () => {
      const parts = getSavedSourceAR().split("/").map(Number);
      return parts.length === 2 && parts[0] > 0 && parts[1] > 0
        ? parts[0] / parts[1]
        : 16 / 9;
    };

    // Aspect ratio in stage-%-coords (w% / h%) — same math as the modal
    // version. The stage uses `height: auto` so its rendered ratio always
    // equals the img's natural ratio; the lock-ratio is therefore
    // (target / sourceAR).
    const aspectStageRatio = (aspect) => {
      if (!aspect || aspect === "free") return null;
      if (aspect === "source") return 1;
      const parts = String(aspect).split("/").map(Number);
      if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
      return (parts[0] / parts[1]) / sourceARNum();
    };

    const applyRect = (s) => {
      rectEl.style.left = s.x + "%";
      rectEl.style.top = s.y + "%";
      rectEl.style.width = s.w + "%";
      rectEl.style.height = s.h + "%";
      if (maskTop) maskTop.style.height = s.y + "%";
      if (maskBottom) maskBottom.style.top = (s.y + s.h) + "%";
      if (maskLeft) {
        maskLeft.style.top = s.y + "%";
        maskLeft.style.width = s.x + "%";
        maskLeft.style.height = s.h + "%";
      }
      if (maskRight) {
        maskRight.style.top = s.y + "%";
        maskRight.style.left = (s.x + s.w) + "%";
        maskRight.style.height = s.h + "%";
      }
      if (infoEl) {
        infoEl.innerHTML =
          "x: <strong>" + Math.round(s.x) + "%</strong> · " +
          "y: <strong>" + Math.round(s.y) + "%</strong> · " +
          "w: <strong>" + Math.round(s.w) + "%</strong> · " +
          "h: <strong>" + Math.round(s.h) + "%</strong>";
      }
    };

    // Source aspect detection on first img load.
    if (imgEl) {
      const applyDetected = () => {
        const w = imgEl.naturalWidth;
        const h = imgEl.naturalHeight;
        if (!w || !h) return;
        const gcd = (a, b) => (b ? gcd(b, a % b) : a);
        const g = gcd(w, h);
        const detected = `${w / g}/${h / g}`;
        if (this._livecamCropDetectedAR.get(cameraId) === detected) return;
        this._livecamCropDetectedAR.set(cameraId, detected);
        // Refresh the "(Source)" option label without re-rendering the
        // whole editor (which would lose the user's drag in progress).
        const sel = root.querySelector(`[data-cropcam-aspect="${cameraId}"]`);
        const srcOpt = sel?.querySelector('option[value="source"]');
        if (srcOpt) srcOpt.textContent = `${detected.replace("/", ":")} (Source)`;
      };
      if (imgEl.complete && imgEl.naturalWidth) applyDetected();
      else imgEl.addEventListener("load", applyDetected, { once: true });
    }

    // Reset → full frame.
    resetBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      this._resetCropForCamera(cameraId);
    });

    // Aspect-lock change → snap current rect + persist.
    aspectSel?.addEventListener("change", (e) => {
      const next = e.target.value;
      this._livecamCropAspect.set(cameraId, next);
      const ratio = aspectStageRatio(next);
      if (ratio == null) return;
      const cur = readRect();
      let w = cur.w;
      let h = w / ratio;
      if (cur.y + h > 100) {
        h = 100 - cur.y;
        w = h * ratio;
      }
      if (cur.x + w > 100) {
        w = 100 - cur.x;
        h = w / ratio;
      }
      const snapped = { x: cur.x, y: cur.y, w, h };
      applyRect(snapped);
      this._saveCropForCamera(cameraId, {
        ...snapped,
        source_ar: getSavedSourceAR(),
      });
    });

    // Pointer-driven drag (move + resize).
    const rectFromPointer = (e) => {
      const r = stage.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * 100;
      const py = ((e.clientY - r.top) / r.height) * 100;
      return { px: Math.max(0, Math.min(100, px)), py: Math.max(0, Math.min(100, py)) };
    };

    let drag = null; // { mode, startPx, startRect }

    const onMove = (e) => {
      if (!drag) return;
      const { px, py } = rectFromPointer(e);
      const start = drag.startRect;
      let next;
      if (drag.mode === "move") {
        const dx = px - drag.startPx.x;
        const dy = py - drag.startPx.y;
        next = {
          x: Math.max(0, Math.min(100 - start.w, start.x + dx)),
          y: Math.max(0, Math.min(100 - start.h, start.y + dy)),
          w: start.w,
          h: start.h,
        };
      } else {
        const anchor = {
          tl: { x: start.x + start.w, y: start.y + start.h },
          tr: { x: start.x,           y: start.y + start.h },
          bl: { x: start.x + start.w, y: start.y },
          br: { x: start.x,           y: start.y },
        }[drag.mode];
        let x1 = Math.min(anchor.x, px);
        let x2 = Math.max(anchor.x, px);
        let y1 = Math.min(anchor.y, py);
        let y2 = Math.max(anchor.y, py);
        const lock = this._livecamCropAspect.get(cameraId) || "source";
        const ratio = aspectStageRatio(lock);
        if (ratio != null) {
          let w = x2 - x1;
          let h = y2 - y1;
          if (w / Math.max(h, 0.0001) > ratio) h = w / ratio;
          else                                  w = h * ratio;
          const anchorRight  = anchor.x === start.x + start.w;
          const anchorBottom = anchor.y === start.y + start.h;
          if (anchorRight)  { x1 = anchor.x - w; x2 = anchor.x; }
          else              { x1 = anchor.x;     x2 = anchor.x + w; }
          if (anchorBottom) { y1 = anchor.y - h; y2 = anchor.y; }
          else              { y1 = anchor.y;     y2 = anchor.y + h; }
          // Clamp + re-fit (preserves ratio if a wall is hit).
          if (x1 < 0)   { w = anchorRight ? anchor.x : x2;          h = w / ratio;
                          if (anchorRight)  { x1 = 0; x2 = anchor.x; } else { x1 = anchor.x; x2 = anchor.x + w; }
                          if (anchorBottom) { y1 = anchor.y - h; y2 = anchor.y; } else { y1 = anchor.y; y2 = anchor.y + h; } }
          if (x2 > 100) { w = anchorRight ? anchor.x : 100 - anchor.x; h = w / ratio;
                          if (anchorRight)  { x1 = anchor.x - w; x2 = anchor.x; } else { x1 = anchor.x; x2 = 100; }
                          if (anchorBottom) { y1 = anchor.y - h; y2 = anchor.y; } else { y1 = anchor.y; y2 = anchor.y + h; } }
          if (y1 < 0)   { h = anchorBottom ? anchor.y : y2;          w = h * ratio;
                          if (anchorBottom) { y1 = 0; y2 = anchor.y; } else { y1 = anchor.y; y2 = anchor.y + h; }
                          if (anchorRight)  { x1 = anchor.x - w; x2 = anchor.x; } else { x1 = anchor.x; x2 = anchor.x + w; } }
          if (y2 > 100) { h = anchorBottom ? anchor.y : 100 - anchor.y; w = h * ratio;
                          if (anchorBottom) { y1 = anchor.y - h; y2 = anchor.y; } else { y1 = anchor.y; y2 = 100; }
                          if (anchorRight)  { x1 = anchor.x - w; x2 = anchor.x; } else { x1 = anchor.x; x2 = anchor.x + w; } }
        }
        const minSize = 5;
        if (x2 - x1 < minSize || y2 - y1 < minSize) return;
        next = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      }
      applyRect(next);
    };

    const onUp = () => {
      if (!drag) return;
      drag = null;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      // Commit final rectangle. Re-render will re-apply the same values
      // so there's no visual flicker.
      const final = readRect();
      this._saveCropForCamera(cameraId, {
        ...final,
        source_ar: getSavedSourceAR(),
      });
    };

    const startDrag = (mode, e) => {
      e.preventDefault();
      e.stopPropagation();
      const { px, py } = rectFromPointer(e);
      drag = {
        mode,
        startPx: { x: px, y: py },
        startRect: readRect(),
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    };

    stage.querySelectorAll("[data-handle]").forEach((h) => {
      h.addEventListener("pointerdown", (e) => startDrag(h.dataset.handle, e));
    });
    rectEl.addEventListener("pointerdown", (e) => {
      if (e.target.dataset.handle) return; // handle already handled it
      startDrag("move", e);
    });
  }

  async _exportYamlConfig() {
    const btn = this.shadowRoot.getElementById("yaml-export-btn");
    const flash = (msg, isError = false) => {
      if (!btn) return;
      const orig = btn.innerHTML;
      btn.innerHTML = `<span style="color:${isError ? "var(--error-color,#d32f2f)" : "var(--success-color,#2e7d32)"};">${msg}</span>`;
      setTimeout(() => { if (btn.isConnected) btn.innerHTML = orig; }, 1600);
    };
    try {
      const yaml = yamlDump(this._config || {}, { lineWidth: 100, noRefs: true });
      await navigator.clipboard.writeText(yaml);
      flash("Copied to clipboard");
    } catch (err) {
      flash(`Copy failed: ${err?.message || err}`, true);
    }
  }

  async _mediaBrowserGoBack() {
    if (!this._mediaBrowserHistory.length) return;
    const prev = this._mediaBrowserHistory.pop();
    if (prev === undefined) return;

    this._mediaBrowserLoading = true;
    this._mediaBrowserPath = prev;
    this._mediaBrowserItems = [];
    this._scheduleRender();

    const items = await this._browseMediaFolderNodes(prev);
    if (this._mediaBrowserPath !== prev) return;

    this._mediaBrowserItems = items;
    this._mediaBrowserLoading = false;
    this._scheduleRender();
  }

  _appendMediaSourceValue(value) {
    const nextValue = this._normalizeMediaSourceValue(value);
    if (!nextValue) return;

    const current = Array.isArray(this._config.media_sources)
      ? this._config.media_sources.map((x) => String(x).trim()).filter(Boolean)
      : [];

    const set = new Set(current.map((x) => x.toLowerCase()));
    if (!set.has(nextValue.toLowerCase())) {
      current.push(nextValue);
    }

    const mediaEl = this.shadowRoot?.getElementById("mediasources");
    if (mediaEl) {
      mediaEl.value = current.join("\n");
    }

    this._config = this._stripAlwaysTrueKeys({
      ...this._config,
      media_sources: current,
    });
    delete this._config.media_source;

    this._fire();
    this._applyFieldValidation("mediasources");
    this._closeSuggestions("mediasources");
    this._scheduleRender();
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

  _getStyleVariableValue(variableName) {
    const styleVariables = String(this._config?.style_variables || "");
    const escaped = String(variableName || "").replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
    const match = styleVariables.match(
      new RegExp(`${escaped}\\s*:\\s*([^;]+)`)
    );

    return match ? match[1].trim() : "";
  }

  _setStyleVariable(variable, value) {
    const current = String(this._config.style_variables || "");

    const lines = current
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !l.startsWith(variable));

    lines.push(`${variable}: ${value};`);

    this._config = this._stripAlwaysTrueKeys({
      ...this._config,
      style_variables: lines.join("\n"),
    });
  }

  _removeStyleVariable(variable) {
    const current = String(this._config.style_variables || "");

    const lines = current
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !l.startsWith(variable));

    this._config = this._stripAlwaysTrueKeys({
      ...this._config,
      style_variables: lines.join("\n"),
    });
  }

  _createColorPicker(hostId, variable, value) {
    const host = this.shadowRoot?.getElementById(hostId);
    if (!host) return;

    host.innerHTML = "";

    const picker = document.createElement("input");
    picker.type = "color";
    picker.className = "cgc-color";

    const isTransparent = value === "transparent";

    picker.value =
      value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
        ? value
        : "#000000";

    picker.disabled = isTransparent;

    host.appendChild(picker);

    picker.addEventListener("change", (e) => {
      const color = e.target.value;
      this._setStyleVariable(variable, color);
      this._fire();
      this._scheduleRender();
    });
  }

  _bindColorControls(sig = {}) {
    STYLE_SECTIONS.forEach((section) => {
      section.controls.forEach((ctrl) => {
        if (ctrl.type === "color") {
          this._createColorPicker(
            ctrl.hostId,
            ctrl.variable,
            this._getStyleVariableValue(ctrl.variable)
          );
        }
      });
    });

    this.shadowRoot.querySelectorAll("[data-reset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const variable = btn.dataset.reset;
        this._removeStyleVariable(variable);
        this._fire();
        this._scheduleRender();
      }, sig);
    });

    this.shadowRoot.querySelectorAll("[data-transparent]").forEach((el) => {
      const variable = el.dataset.transparent;
      const current = this._getStyleVariableValue(variable);

      el.checked = current === "transparent";

      el.addEventListener("change", (e) => {
        if (e.target.checked) {
          this._setStyleVariable(variable, "transparent");
        } else {
          this._removeStyleVariable(variable);
        }

        this._fire();
        this._scheduleRender();
      }, sig);
    });

    this.shadowRoot.querySelectorAll("[data-radius]").forEach((slider) => {
      const variable = slider.dataset.radius;
      const numInput = this.shadowRoot.getElementById(slider.dataset.radiusMirrorId);

      slider.addEventListener("input", (e) => {
        if (numInput) numInput.value = e.target.value;
      }, sig);

      slider.addEventListener("change", (e) => {
        if (numInput) numInput.value = e.target.value;
        this._setStyleVariable(variable, e.target.value + "px");
        this._fire();
        this._scheduleRender();
      }, sig);
    });

    this.shadowRoot.querySelectorAll("[data-radius-input]").forEach((numInput) => {
      const variable = numInput.dataset.radiusInput;
      const defaultVal = Number(numInput.dataset.radiusDefault);
      const slider = this.shadowRoot.querySelector(`[data-radius="${variable}"]`);
      const min = Number(numInput.min);
      const max = Number(numInput.max);

      const commit = () => {
        let v = Number(numInput.value);
        if (!Number.isFinite(v)) v = defaultVal;
        v = Math.min(max, Math.max(min, Math.round(v)));
        numInput.value = v;
        if (slider) slider.value = v;
        this._setStyleVariable(variable, v + "px");
        this._fire();
        this._scheduleRender();
      };

      numInput.addEventListener("input", () => {
        const v = Number(numInput.value);
        if (Number.isFinite(v) && slider) slider.value = Math.min(max, Math.max(min, v));
      }, sig);

      numInput.addEventListener("change", commit, sig);
      numInput.addEventListener("blur", commit, sig);
      numInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); numInput.blur(); }
      }, sig);
    });

    this.shadowRoot.querySelectorAll("[data-seg-key]").forEach((el) => {
      el.addEventListener("change", (e) => {
        this._set(el.dataset.segKey, e.target.value);
      }, sig);
    });

    this.shadowRoot.querySelectorAll("[data-config-slider]").forEach((slider) => {
      const key = slider.dataset.configSlider;
      const defaultVal = Number(slider.dataset.sliderDefault);
      const numInput = this.shadowRoot.getElementById(slider.dataset.sliderMirrorId);

      slider.addEventListener("input", (e) => {
        if (numInput) numInput.value = e.target.value;
      }, sig);

      slider.addEventListener("change", (e) => {
        const v = Number(e.target.value);
        if (numInput) numInput.value = v;
        this._set(key, Number.isFinite(v) ? v : defaultVal);
      }, sig);
    });

    this.shadowRoot.querySelectorAll("[data-slider-input]").forEach((numInput) => {
      const key = numInput.dataset.sliderInput;
      const defaultVal = Number(numInput.dataset.sliderDefault);
      const slider = this.shadowRoot.getElementById(numInput.dataset.sliderTarget);
      const min = Number(numInput.min);
      const max = Number(numInput.max);

      const commit = () => {
        let v = Number(numInput.value);
        if (!Number.isFinite(v)) v = defaultVal;
        v = Math.min(max, Math.max(min, Math.round(v)));
        numInput.value = v;
        if (slider) slider.value = v;
        this._set(key, v);
      };

      numInput.addEventListener("input", () => {
        const v = Number(numInput.value);
        if (Number.isFinite(v) && slider) slider.value = Math.min(max, Math.max(min, v));
      }, sig);

      numInput.addEventListener("change", commit, sig);
      numInput.addEventListener("blur", commit, sig);
      numInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); numInput.blur(); }
      }, sig);
    });

    this.shadowRoot.querySelectorAll("[data-slider-reset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.sliderReset;
        const defaultVal = Number(btn.dataset.sliderDefault);
        this._set(key, defaultVal);
      }, sig);
    });

    this.shadowRoot.querySelectorAll("details.style-section").forEach((det) => {
      det.addEventListener("toggle", () => {
        const id = det.id.replace("style-section-", "");
        if (det.open) {
          this._openStyleSections.add(id);
        } else {
          this._openStyleSections.delete(id);
        }
      }, sig);
    });
  }

  /** Compute the cache key the detector should run against. Bumps when
   * roots / sensor entities / hass identity change (sample shape can
   * change with hass swap, e.g. dev → prod). Empty string means there's
   * nothing worth probing (no sources configured). */
  _formatDetectKey() {
    const roots = Array.isArray(this._config?.media_sources)
      ? this._config.media_sources.filter(Boolean)
      : [];
    const ents = Array.isArray(this._config?.entities)
      ? this._config.entities.filter(Boolean)
      : [];
    if (!roots.length && !ents.length) return "";
    return `${roots.join("|")}::${ents.join(",")}`;
  }

  /** Run path-format detection: probe configured sources, score every
   * candidate, store the full result for the scoreboard view. The
   * detector itself stays format-agnostic; this method just collects
   * samples (Frigate event-id roots filtered out, recordings kept,
   * sensor `fileList`s included) and hands them to `scoreSamples`. */
  async _runFormatDetection() {
    if (this._detectInFlight) return;
    if (!this._hass) return;

    const allRoots = Array.isArray(this._config?.media_sources)
      ? this._config.media_sources.filter(Boolean)
      : [];
    const probableRoots = allRoots.filter(
      (r) => !(isFrigateRoot(r) && !isFrigateRecordingsRoot(r))
    );

    const SENSOR_SAMPLE_CAP = 12;
    const sensorSamples = [];
    const entityIds = Array.isArray(this._config?.entities)
      ? this._config.entities
      : [];
    for (const id of entityIds) {
      if (typeof id !== "string" || !id) continue;
      const raw = this._hass?.states?.[id]?.attributes?.fileList;
      const list = Array.isArray(raw) ? raw : [];
      for (const p of list) {
        if (typeof p === "string" && p) sensorSamples.push(p);
        if (sensorSamples.length >= SENSOR_SAMPLE_CAP) break;
      }
      if (sensorSamples.length >= SENSOR_SAMPLE_CAP) break;
    }

    if (probableRoots.length === 0 && sensorSamples.length === 0) {
      this._detectResult = null;
      this._detectStatus = allRoots.length
        ? "Frigate event roots use event-ids — no format needed"
        : "Add a sensor or media folder to detect from";
      this._detectKey = this._formatDetectKey();
      this._scheduleRender();
      return;
    }

    this._detectInFlight = true;
    this._detectStatus = "";
    this._scheduleRender();
    try {
      const browse = (id) =>
        this._hass.callWS({ type: "media_source/browse_media", media_content_id: id });
      const probedSamples = probableRoots.length
        ? await collectMediaSamples(probableRoots, browse).catch(() => [])
        : [];
      const samples = [...probedSamples, ...sensorSamples];
      const result = scoreSamples(samples);

      this._detectResult = result;
      this._detectStatus = result.format
        ? `Detected ${result.format} (${result.matches}/${result.sampled} matched)`
        : samples.length
          ? `No common pattern matched across ${samples.length} sample${samples.length === 1 ? "" : "s"}`
          : "Probe found no files";
      this._detectKey = this._formatDetectKey();

      // Auto-fill empty input with the winner so users don't have to
      // click anything for the common case. Don't clobber a value the
      // user has already typed.
      if (result.format && !String(this._config?.path_datetime_format ?? "").trim()) {
        const next = { ...this._config, path_datetime_format: result.format };
        this._commit(next);
      }
    } catch (e) {
      console.warn("path-format detect failed:", e);
      this._detectStatus = "Detect failed (see console)";
      this._detectResult = null;
    } finally {
      this._detectInFlight = false;
      this._scheduleRender();
    }
  }

  _renderDetectStatusText() {
    return this._detectStatus
      ? String(this._detectStatus)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
      : "";
  }

  /** Render the expandable "tested formats" details panel. Each row
   * shows a candidate, its match count, and a click handler that
   * applies it. Hidden until detection has run; gracefully empty when
   * the result has no scores (Frigate-only / unavailable sources). */
  _renderDetectScoreboard() {
    const result = this._detectResult;
    if (!result || !Array.isArray(result.allScores) || !result.allScores.length) {
      return "";
    }
    const current = String(this._config?.path_datetime_format ?? "").trim();
    const total = result.sampled || 0;
    const esc = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const rows = result.allScores
      .map((entry) => {
        const fmt = entry.format;
        const m = Number.isFinite(entry.matches) ? entry.matches : 0;
        const matchPct = total > 0 ? Math.round((m / total) * 100) : 0;
        const isWinner = fmt === result.format;
        const isCurrent = fmt === current;
        const cls = [
          "pathfmt-row",
          m > 0 ? "matched" : "no-match",
          isWinner ? "winner" : "",
          isCurrent ? "current" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const safe = esc(fmt);
        return `<button type="button" class="${cls}" data-pathfmt="${safe}" title="${safe}">
          <span class="pathfmt-row-fmt">${safe}</span>
          <span class="pathfmt-row-count">${m}/${total}</span>
          <span class="pathfmt-row-bar"><span style="width:${matchPct}%"></span></span>
        </button>`;
      })
      .join("");

    return `<details class="pathfmt-details">
      <summary>${svgIcon('mdi:chevron-right', 14)}<span>Show all tested formats (${result.allScores.length})</span></summary>
      <div class="pathfmt-rows">${rows}</div>
    </details>`;
  }

  _render() {
    const c = this._config || {};

    try {
      const ae = this.shadowRoot?.activeElement;
      if (ae && ae.id) {
        const st =
          typeof ae.selectionStart === "number" ? ae.selectionStart : null;
        const en = typeof ae.selectionEnd === "number" ? ae.selectionEnd : null;
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
    const combinedModeOn = cSourceMode === "combined";
    const startMode = String(c.start_mode || "gallery");

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

    const pathDatetimeFormat = String(
      c.path_datetime_format || ""
    ).trim();

    const objectFiltersArr = this._normalizeObjectFilters(
      c.object_filters || []
    );
    const selectedCount = objectFiltersArr.length;
    const objectColors = (typeof c.object_colors === "object" && c.object_colors !== null) ? c.object_colors : {};

    const thumbSize = Number(c.thumb_size) || 140;
    const maxMedia = (() => {
      const n = this._numInt(c.max_media, 50);
      return this._clampInt(n, 1, 500);
    })();

    const previewPos = String(c.preview_position || "top");
    const objectFit = String(c.object_fit || "cover");

    const thumbBarPos = (() => {
      const v = String(c.thumb_bar_position || "bottom")
        .toLowerCase()
        .trim();
      if (v === "hidden") return "hidden";
      if (v === "top") return "top";
      return "bottom";
    })();

    const thumbLayout = (() => {
      const v = String(c.thumb_layout || "horizontal").toLowerCase().trim();
      return v === "vertical" ? "vertical" : "horizontal";
    })();

    const thumbSortOrder = (() => {
      const v = String(c.thumb_sort_order || "newest").toLowerCase().trim();
      return v === "oldest" ? "oldest" : "newest";
    })();

    const thumbSizeMuted = thumbLayout === "vertical";

    const allServices = this._hass?.services || {};
    const shellCmds = Object.keys(allServices.shell_command || {})
      .map((svc) => `shell_command.${svc}`)
      .sort((a, b) => a.localeCompare(b));
    const restCmds = Object.keys(allServices.rest_command || {})
      .map((svc) => `rest_command.${svc}`)
      .sort((a, b) => a.localeCompare(b));

    const deleteService = String(
      c.delete_service || c.shell_command || ""
    ).trim();
    const deleteOk =
      !deleteService || /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(deleteService);

    const deleteChoices = (() => {
      const set = new Set(shellCmds);
      if (deleteService) set.add(deleteService);
      return Array.from(set).sort((a, b) => a.localeCompare(b));
    })();

    const frigateDeleteService = String(c.frigate_delete_service || "").trim();
    const frigateDeleteOk =
      !frigateDeleteService ||
      /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(frigateDeleteService);
    const frigateDeleteChoices = (() => {
      const set = new Set(restCmds);
      if (frigateDeleteService) set.add(frigateDeleteService);
      return Array.from(set).sort((a, b) => a.localeCompare(b));
    })();

    const thumbFramePct = (() => {
      const n = Number(c.thumbnail_frame_pct);
      if (!Number.isFinite(n)) return DEFAULT_THUMBNAIL_FRAME_PCT;
      return Math.min(100, Math.max(0, Math.round(n)));
    })();

    const autoplay = c.autoplay === true;
    const autoMuted =
      c.auto_muted !== undefined ? c.auto_muted === true : DEFAULT_AUTOMUTED;
    const liveAutoMuted =
      c.live_auto_muted !== undefined ? c.live_auto_muted === true : DEFAULT_LIVE_AUTO_MUTED;

    const cleanMode = c.clean_mode === true;
    const fullscreenZoom = c.fullscreen_zoom !== false;
    const persistentControls = c.persistent_controls === true;

    const liveEnabled = c.live_enabled === true;
    const liveCameraEntities = getLiveCameraEntityIds(c);
    const liveLayout = c.live_layout === "grid" ? "grid" : "single";
    const liveFullscreen = c.live_fullscreen === "video" ? "video" : "card";
    const liveGridCols = Number(c.live_grid_columns) || 0;
    const liveGridEmphasis =
      c.live_grid_emphasis === "top" || c.live_grid_emphasis === "hero"
        ? c.live_grid_emphasis
        : DEFAULT_LIVE_GRID_EMPHASIS;


    const cameraEntities = getEditorCameraEntities(this._hass?.states, this._hass);

    const rootVars = this._renderRootVars();

    const tabBtn = (key, label, icon) => `
      <button
        type="button"
        class="tabbtn ${this._activeTab === key ? "on" : ""}"
        data-tab="${key}"
      >
        ${svgIcon(icon, 16)}
        <span>${label}</span>
      </button>
    `;

    const mediaBrowserHtml = this._renderMediaBrowser();

    // Shared styling-tab markup — identical between v1 and v2.
    const buildStylingPanelHtml = () => this._renderStylingTab();

    // ====================================================================
    // v2 editor (beta) — 6 tabs with collapsibles in Gallery / Live.
    // Each builder returns a complete `<div class="tabpanel">` so the
    // partial-update path (replaceWith on .tabpanel) keeps working.
    // ====================================================================
    // v2 collapsibles reuse the existing .style-section / .style-section-head
    // CSS so they look identical to the Styling-tab accordion users already
    // know. `icon` is optional — pass an mdi name to show a leading glyph.
    //
    // Open-state lookup order:
    //   1. `_v2OpenSections` map keyed `${tab}.${id}` — set by user toggles
    //   2. fallback to `openByDefault` for first render
    const v2Collapsible = (id, title, openByDefault, bodyHtml, icon, opts) => {
      const key = `${this._activeTab}.${id}`;
      const isOpen = this._v2OpenSections.has(key)
        ? this._v2OpenSections.get(key)
        : openByDefault;
      const muted = opts?.muted === true;
      const mutedHint = opts?.mutedHint || "";
      return `
        <details class="style-section ${muted ? "muted" : ""}" ${isOpen ? "open" : ""} data-v2-section="${id}">
          <summary class="style-section-head">
            ${icon ? svgIcon(icon, 18) : ``}
            <span>${title}</span>
            ${muted && mutedHint ? `<em style="margin-left:8px;font-size:11px;opacity:0.6;font-style:italic;">${mutedHint}</em>` : ""}
            <span class="style-chevron">${svgIcon('mdi:chevron-down', 18)}</span>
          </summary>
          <div class="style-section-body">
            ${bodyHtml}
          </div>
        </details>
      `;
    };

    // Small right-aligned "Expand all / Collapse all" link rendered at
    // the top of any v2 tabpanel that has multiple collapsibles. Click
    // handler is wired in the post-render block.
    const v2ExpandToggle = `
      <div class="v2-expand-row">
        <button type="button" class="v2-expand-all" data-v2-expand>Expand all</button>
      </div>
    `;

    const buildSourceTabV2 = () => this._renderSourceTab({
      startMode,
      sensorModeOn,
      mediaModeOn,
      combinedModeOn,
      invalidEntities,
      mediaHasFile,
      v2ExpandToggle,
      v2Collapsible,
    });

    /**
     * Toggle-row helper for the "Show chevrons" config flag in both
     * Gallery and Live tabs. Same shape (row + row-head + label + desc
     * + switch), only the id, label, and description differ — extracted
     * so the two callers stay in sync if the row chrome ever changes.
     */
    const chevronToggleRow = (id, desc, checked) => `
      <div class="row">
        <div class="row-head">
          <div>
            <div class="lbl">Show chevrons</div>
            <div class="desc">${desc}</div>
          </div>
          <div class="togrow">
            <label class="cgc-switch"><input type="checkbox" id="${id}" ${checked ? "checked" : ""}><span class="cgc-track"></span></label>
          </div>
        </div>
      </div>
    `;

    const buildGalleryTabV2 = () => this._renderGalleryTab({
      objectFit,
      previewPos,
      cleanMode,
      fullscreenZoom,
      c,
      chevronToggleRow,
      persistentControls,
      v2ExpandToggle,
      v2Collapsible,
    });

    const buildLiveTabV2 = () => this._renderLiveTab({
      liveEnabled,
      cameraEntities,
      liveCameraEntities,
      liveLayout,
      liveGridEmphasis,
      liveFullscreen,
      c,
      chevronToggleRow,
      v2Collapsible,
      liveGridCols,
    });

    const buildThumbsTabV2 = () => this._renderThumbsTab({
      c,
      cleanMode,
      selectedCount,
      objectFiltersArr,
      thumbLayout,
      thumbSizeMuted,
      thumbBarPos,
      thumbSortOrder,
      thumbFramePct,
      v2ExpandToggle,
      v2Collapsible,
      objectColors,
    });

    const buildStylingTabV2 = () =>
      buildStylingPanelHtml().replace(
        '<div class="tabpanel" data-panel="styling">',
        `<div class="tabpanel" data-panel="styling">${v2ExpandToggle}`
      );

    const buildAdvancedTabV2 = () => this._renderAdvancedTab({
      mediaModeOn,
      deleteOk,
      deleteChoices,
      c,
      frigateDeleteOk,
      frigateDeleteChoices,
      v2ExpandToggle,
      v2Collapsible,
      deleteService,
      frigateDeleteService,
    });

    const buildV2PanelHtml = () => {
      const tab = this._activeTab;
      if (tab === "source")   return buildSourceTabV2();
      if (tab === "gallery")  return buildGalleryTabV2();
      if (tab === "live")     return buildLiveTabV2();
      if (tab === "thumbs")   return buildThumbsTabV2();
      if (tab === "styling")  return buildStylingTabV2();
      if (tab === "advanced") return buildAdvancedTabV2();
      return `<div class="tabpanel" data-panel="${tab}"></div>`;
    };

    const buildPanelHtml = () => buildV2PanelHtml();

    if (!this._editorRendered) {
    this.shadowRoot.innerHTML = `
      <style>${EDITOR_CSS}</style>

      <div class="wrap v2" style="${rootVars}">

        <div class="tabs">
          <div class="tabbar">
            ${tabBtn("source", "Source", "mdi:database-outline")}
            ${tabBtn("gallery", "Gallery", "mdi:image-outline")}
            ${tabBtn("live", "Live", "mdi:video-outline")}
            ${tabBtn("thumbs", "Thumbnails", "mdi:view-grid-outline")}
            ${tabBtn("styling", "Styling", "mdi:palette-outline")}
            ${tabBtn("advanced", "Advanced", "mdi:tune-vertical")}
          </div>

          ${buildPanelHtml()}

        </div>
      </div>

      <div id="cgc-browser-slot">${mediaBrowserHtml}</div>
    `;
    this.shadowRoot.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => this._setActiveTab(btn.dataset.tab));
    });
    this._editorRendered = true;
    } else {
      // Partial update — avoid rebuilding the full shadow DOM
      const panelHtml = buildPanelHtml();

      // Update CSS vars on wrap
      const wrapEl = this.shadowRoot.querySelector(".wrap");
      if (wrapEl) wrapEl.setAttribute("style", rootVars);

      // Update tab button active states
      this.shadowRoot.querySelectorAll("[data-tab]").forEach((btn) => {
        btn.classList.toggle("on", btn.dataset.tab === this._activeTab);
      });

      // Swap tab panel
      const oldPanel = this.shadowRoot.querySelector(".tabpanel");
      const tmp = document.createElement("div");
      tmp.innerHTML = panelHtml;
      const newPanel = tmp.firstElementChild;
      // Preserve v2 collapsible open-state across re-renders. Without
      // this, flipping a toggle inside Playback/Toolbar would re-render
      // the tab and collapse the section back to its default state.
      if (oldPanel && newPanel) {
        oldPanel.querySelectorAll("details[data-v2-section]").forEach((oldS) => {
          const id = oldS.getAttribute("data-v2-section");
          const newS = newPanel.querySelector(`details[data-v2-section="${id}"]`);
          if (!newS) return;
          if (oldS.hasAttribute("open")) newS.setAttribute("open", "");
          else newS.removeAttribute("open");
        });
      }
      if (oldPanel && newPanel) {
        oldPanel.replaceWith(newPanel);
      } else if (!oldPanel && newPanel) {
        this.shadowRoot.querySelector(".tabbar")?.insertAdjacentElement("afterend", newPanel);
      }

      // Update media browser slot
      const browserSlot = this.shadowRoot.getElementById("cgc-browser-slot");
      if (browserSlot) browserSlot.innerHTML = mediaBrowserHtml;

    }

    if (this._evtCtrl) this._evtCtrl.abort();
    this._evtCtrl = new AbortController();
    const _sig = { signal: this._evtCtrl.signal };

    this._wireSectionToggles({ _sig });

    const $ = (id) => this.shadowRoot.getElementById(id);

    this._wireObjectFilters({ _sig, $ });

    const entitiesEl = $("entities");
    const mediaEl = $("mediasources");
    const pathFmtEl = $("pathfmt");
    const delserviceEl = $("delservice");

    const thumbEl = $("thumb");
    const maxmediaEl = $("maxmedia");
    const thumbpctEl = $("thumbpct");
    const thumbpctvalEl = $("thumbpctval");

    const autoplayEl = $("autoplay");
    const autoMutedEl = $("auto_muted");
    const liveAutoMutedEl = $("live_auto_muted");

    this._setControlValue(entitiesEl, entitiesText);
    this._setControlValue(mediaEl, mediaSourcesText);
    this._setControlValue(pathFmtEl, pathDatetimeFormat);
    this._setControlValue(thumbEl, String(thumbSize));
    this._setControlValue(maxmediaEl, String(maxMedia));
    this._setControlValue(thumbpctEl, thumbFramePct);
    if (autoplayEl) autoplayEl.checked = autoplay;
    if (autoMutedEl) autoMutedEl.checked = autoMuted;
    if (liveAutoMutedEl) liveAutoMutedEl.checked = liveAutoMuted;

    if (delserviceEl) delserviceEl.value = deleteService;

    this._applyFieldValidation("entities");
    this._applyFieldValidation("mediasources");

    this._bindColorControls(_sig);
    this._bindWizardEvents(_sig);

    this._wireSourceAndGalleryFields({ _sig, $, pathFmtEl, delserviceEl, thumbEl, maxmediaEl });

    this._wirePillsAndToolbar();

    this._wireLiveOptions({ _sig, $, autoplayEl, autoMutedEl, liveAutoMutedEl });

    this._wirePtz({ $ });

    this._wireAdvanced({ $ });

    this._wireLiveLayout({ $ });

    this._wireLiveCameras({ cameraEntities, _sig, $ });

    this._wireMenuButtonsAndThumbActions({ _sig, $ });

    this._wireLiveCameraReorder();

    this._wireThumbFramePct({ thumbpctEl, thumbpctvalEl });

    this._wireMediaBrowser({ $ });

    try {
      const fs = this._focusState;
      if (fs && fs.id) {
        const el = $(fs.id);
        if (el && typeof el.focus === "function") {
          if (
            fs.value != null &&
            typeof el.value === "string" &&
            el.value !== fs.value
          ) {
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

  /** CSS variables for the editor root. Part of _render(). */
  _renderRootVars() {
    return `
      --ed-radius-panel: 18px;
      --ed-radius-row: 16px;
      --ed-radius-input: 12px;
      --ed-radius-pill: 999px;
      --ed-space-1: 8px;
      --ed-space-2: 12px;
      --ed-space-3: 16px;
      --ed-space-4: 20px;

      --ed-muted: var(--cgc-editor-muted-opacity, 0.60);

      --ed-text: var(--primary-text-color, rgba(0,0,0,0.87));
      --ed-text2: var(--secondary-text-color, rgba(0,0,0,0.60));

      --ed-section-bg: var(--card-background-color, #fff);
      --ed-section-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.12)) 55%,
        transparent
      );
      --ed-section-glow: var(
        --cgc-editor-section-glow,
        0 1px 0 rgba(255,255,255,0.02) inset
      );

      --ed-row-bg: color-mix(
        in srgb,
        var(--secondary-background-color, rgba(0,0,0,0.03)) 60%,
        transparent
      );
      --ed-row-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.12)) 48%,
        transparent
      );

      --ed-input-bg: var(--secondary-background-color, rgba(0,0,0,0.04));
      --ed-input-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.14)) 58%,
        transparent
      );

      --ed-select-bg: var(--secondary-background-color, rgba(0,0,0,0.04));
      --ed-select-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.14)) 58%,
        transparent
      );

      --ed-seg-bg: var(--secondary-background-color, rgba(0,0,0,0.04));
      --ed-seg-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.12)) 52%,
        transparent
      );
      --ed-seg-txt: var(--secondary-text-color, rgba(0,0,0,0.60));
      --ed-seg-on-bg: var(--primary-text-color, rgba(0,0,0,0.88));
      --ed-seg-on-txt: var(--primary-background-color, rgba(255,255,255,0.98));

      --ed-tab-bg: var(--secondary-background-color, rgba(0,0,0,0.03));
      --ed-tab-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.12)) 52%,
        transparent
      );
      --ed-tab-txt: var(--secondary-text-color, rgba(0,0,0,0.60));
      --ed-tab-on-bg: color-mix(
        in srgb,
        var(--primary-color, #03a9f4) 14%,
        var(--secondary-background-color, rgba(0,0,0,0.04))
      );
      --ed-tab-on-border: var(--primary-color, #03a9f4);
      --ed-tab-on-txt: var(--primary-text-color, rgba(0,0,0,0.88));

      --ed-chip-bg: var(--secondary-background-color, rgba(0,0,0,0.03));
      --ed-chip-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.12)) 52%,
        transparent
      );
      --ed-chip-disabled: 0.50;
      --ed-chip-txt: var(--primary-text-color, rgba(0,0,0,0.88));
      --ed-chip-icon-bg: color-mix(
        in srgb,
        var(--secondary-background-color, rgba(0,0,0,0.03)) 80%,
        transparent
      );
      --ed-chip-on-bg: color-mix(
        in srgb,
        var(--primary-color, #03a9f4) 12%,
        var(--secondary-background-color, rgba(0,0,0,0.03))
      );
      --ed-chip-on-border: var(--primary-color, #03a9f4);
      --ed-chip-on-txt: var(--primary-text-color, rgba(0,0,0,0.92));
      --ed-chip-on-icon-bg: color-mix(
        in srgb,
        var(--primary-color, #03a9f4) 18%,
        transparent
      );

      --ed-pill-bg: var(--secondary-background-color, rgba(0,0,0,0.08));
      --ed-pill-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.14)) 58%,
        transparent
      );
      --ed-pill-txt: var(--primary-text-color, rgba(0,0,0,0.88));

      --ed-sugg-bg: var(--card-background-color, #fff);
      --ed-sugg-border: color-mix(
        in srgb,
        var(--divider-color, rgba(0,0,0,0.14)) 60%,
        transparent
      );
      --ed-sugg-hover: var(--secondary-background-color, rgba(0,0,0,0.045));
      --ed-sugg-active: color-mix(
        in srgb,
        var(--primary-color, #03a9f4) 10%,
        var(--secondary-background-color, rgba(0,0,0,0.04))
      );

      --ed-arrow: var(--secondary-text-color, rgba(0,0,0,0.58));
      --ed-focus-ring: color-mix(
        in srgb,
        var(--primary-color, #03a9f4) 20%,
        transparent
      );

      --ed-valid: var(--success-color, rgba(46,160,67,0.95));
      --ed-valid-glow: color-mix(
        in srgb,
        var(--success-color, rgba(46,160,67,0.95)) 20%,
        transparent
      );

      --ed-invalid: var(--error-color, rgba(219,68,55,0.92));
      --ed-invalid-glow: color-mix(
        in srgb,
        var(--error-color, rgba(219,68,55,0.92)) 20%,
        transparent
      );

      --ed-warning: var(--warning-color, rgba(245,158,11,0.95));
      --ed-warning-bg: color-mix(
        in srgb,
        var(--warning-color, rgba(245,158,11,0.95)) 10%,
        transparent
      );
      --ed-warning-border: color-mix(
        in srgb,
        var(--warning-color, rgba(245,158,11,0.95)) 24%,
        transparent
      );
      --ed-warning-icon-bg: color-mix(
        in srgb,
        var(--warning-color, rgba(245,158,11,0.95)) 14%,
        transparent
      );

      --ed-success-bg: color-mix(
        in srgb,
        var(--success-color, rgba(46,160,67,0.95)) 10%,
        transparent
      );
      --ed-success-border: color-mix(
        in srgb,
        var(--success-color, rgba(46,160,67,0.95)) 24%,
        transparent
      );
      --ed-success-icon-bg: color-mix(
        in srgb,
        var(--success-color, rgba(46,160,67,0.95)) 14%,
        transparent
      );

      --ed-shadow-soft: var(
        --cgc-editor-shadow-soft,
        0 8px 24px rgba(0,0,0,0.10)
      );
      --ed-shadow-float: var(
        --cgc-editor-shadow-float,
        0 14px 36px rgba(0,0,0,0.18)
      );
      --ed-shadow-press: var(
        --cgc-editor-shadow-press,
        0 6px 16px rgba(0,0,0,0.10)
      );
      --ed-shadow-chip: var(
        --cgc-editor-shadow-chip,
        0 8px 18px rgba(0,0,0,0.08)
      );
      --ed-shadow-modal: var(
        --cgc-editor-shadow-modal,
        0 24px 60px rgba(0,0,0,0.28)
      );
      --ed-backdrop: var(--cgc-editor-backdrop, rgba(0,0,0,0.68));
    `;
  }

  /** Open/close state of the collapsible sections and Expand all. Part of _render(). */
  _wireSectionToggles({ _sig }) {
    // Sync user open/close gestures on v2 collapsibles back into
    // _v2OpenSections + localStorage so tab switches / page reloads
    // don't lose the state.
    this.shadowRoot.querySelectorAll("details[data-v2-section]").forEach((d) => {
      d.addEventListener(
        "toggle",
        () => {
          const id = d.getAttribute("data-v2-section");
          if (!id) return;
          this._v2OpenSections.set(`${this._activeTab}.${id}`, d.hasAttribute("open"));
          try {
            localStorage.setItem(
              "cgc_v2_open_sections",
              JSON.stringify(Object.fromEntries(this._v2OpenSections))
            );
          } catch (_) { /* ignore quota / disabled storage */ }
        },
        _sig
      );
    });

    // v2 "Expand all / Collapse all" — toggle every details.style-section
    // inside the current tabpanel. Every v2 tab has at least two
    // collapsibles so the button always has something to do.
    this.shadowRoot.querySelectorAll("[data-v2-expand]").forEach((btn) => {
      const panel = btn.closest(".tabpanel");
      const sections = panel ? panel.querySelectorAll("details.style-section") : [];
      if (!sections.length) return;
      const syncLabel = () => {
        const allOpen = Array.from(sections).every((s) => s.hasAttribute("open"));
        btn.textContent = allOpen ? "Collapse all" : "Expand all";
      };
      syncLabel();
      btn.addEventListener(
        "click",
        () => {
          const allOpen = Array.from(sections).every((s) => s.hasAttribute("open"));
          const opening = !allOpen;
          sections.forEach((s) => {
            if (opening) s.setAttribute("open", "");
            else s.removeAttribute("open");
          });
          btn.textContent = opening ? "Collapse all" : "Expand all";
        },
        _sig
      );
    });
  }

  /** Add, remove and colour object filters. Part of _render(). */
  _wireObjectFilters({ _sig, $ }) {
        // 1. Find the elements
        const addBtn = $("add-filter-btn");
        const nameInput = $("new-filter-name");
        const iconInput = $("new-filter-icon");
        // (native input — no hass roundtrip needed)

        // 2. Reusable helper for adding the entity.
        const handleAddFilter = () => {
          const name = nameInput?.value.trim().toLowerCase();
          const icon = iconInput?.value.trim() || "mdi:magnify";

          if (!name) return;

          // Current filters
          const currentFilters = this._normalizeObjectFilters(this._config.object_filters || []);
          const newFilter = { [name]: icon };
          
          // Save to the config
          this._set("object_filters", [...currentFilters, newFilter]);
          
          // Clear the fields
          if (nameInput) nameInput.value = "";
          if (iconInput) iconInput.value = "";
        };

        // 3. Wire the click listener onto the button.
        addBtn?.addEventListener("click", handleAddFilter, _sig);

        // 4. Enter in the name field adds the filter
        nameInput?.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); handleAddFilter(); }
        });

    // Remove filter.
    this.shadowRoot.querySelectorAll("[data-remove-index]").forEach(btn => {
      btn.addEventListener("click", () => {
        const nameToRemove = btn.dataset.removeIndex;
        const currentFilters = this._normalizeObjectFilters(this._config.object_filters || []);
        
        const nextFilters = currentFilters.filter(f => {
           if (typeof f === 'string') return f !== nameToRemove;
           return Object.keys(f)[0] !== nameToRemove;
        });

        this._set("object_filters", nextFilters);
      });
    });

    this.shadowRoot.querySelectorAll("[data-filtercolor]").forEach(input => {
      input.addEventListener("click", (e) => e.stopPropagation(), _sig);
      input.addEventListener("change", (e) => {
        e.stopPropagation();
        const name = input.dataset.filtercolor;
        const colors = { ...(this._config.object_colors || {}), [name]: e.target.value };
        this._set("object_colors", colors);
      });
    });
  }

  /** Source, delete service, thumbnail and gallery fields. Part of _render(). */
  _wireSourceAndGalleryFields({ _sig, $, pathFmtEl, delserviceEl, thumbEl, maxmediaEl }) {
    this.shadowRoot.querySelectorAll("[data-src]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._set("source_mode", btn.dataset.src);
      });
    });

    const browseBtn = $("browse-media-folders");
    browseBtn?.addEventListener("click", async () => {
      await this._openMediaBrowser("");
    });

    const clearBtn = $("clear-media-folders");
    clearBtn?.addEventListener("click", () => {
      const mediaElInner = $("mediasources");
      if (mediaElInner) mediaElInner.value = "";

      const next = { ...this._config };
      delete next.media_sources;
      delete next.media_source;

      this._commit(next);
      this._applyFieldValidation("mediasources");
      this._scheduleRender();
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
        this._commit(next, { render: true });
        return;
      }

      this._set("delete_service", v);
    };

    delserviceEl?.addEventListener("change", commitDeleteService, _sig);

    const frigateDelserviceEl = $("frigate-delservice");
    const commitFrigateDeleteService = () => {
      const v = String(frigateDelserviceEl?.value || "").trim();
      if (!v) {
        const next = { ...this._config };
        delete next.frigate_delete_service;
        this._commit(next, { render: true });
        return;
      }
      this._set("frigate_delete_service", v);
    };
    frigateDelserviceEl?.addEventListener("change", commitFrigateDeleteService, _sig);


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

    const commitPathFormat = (commit = false) => {
      const raw = String(pathFmtEl?.value ?? "").trim();
      const next = { ...this._config };
      if (!raw) delete next.path_datetime_format;
      else next.path_datetime_format = raw;
      this._config = this._stripAlwaysTrueKeys(next);
      if (commit) { this._fire(); this._scheduleRender(); }
    };

    pathFmtEl?.addEventListener("input", () => commitPathFormat(false), _sig);
    pathFmtEl?.addEventListener("change", () => commitPathFormat(true), _sig);
    pathFmtEl?.addEventListener("blur", () => commitPathFormat(true), _sig);

    // Auto-detect button: re-runs detection on click. The detector
    // also fires once automatically when the editor first sees hass
    // (and when sources change) — see the `set hass` path.
    const detectBtn = $("detect-pathfmt");
    detectBtn?.addEventListener(
      "click",
      () => {
        // Force a re-run by clearing the fingerprint; otherwise the
        // detector short-circuits when the inputs haven't changed.
        this._detectKey = "";
        void this._runFormatDetection();
      },
      _sig
    );

    // Scoreboard row click → apply that format to the input.
    this.shadowRoot.querySelectorAll(".pathfmt-row[data-pathfmt]").forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          const fmt = btn.getAttribute("data-pathfmt") || "";
          if (!pathFmtEl || !fmt) return;
          pathFmtEl.value = fmt;
          commitPathFormat(true);
        },
        _sig
      );
    });

    // First-paint trigger: kick detection when the source fingerprint
    // has changed since the last run. Idempotent against the current
    // inputs; cheap and safe to call on every render.
    if (
      this._hass &&
      !this._detectInFlight &&
      this._formatDetectKey() &&
      this._formatDetectKey() !== this._detectKey
    ) {
      void this._runFormatDetection();
    }

    this.shadowRoot.querySelectorAll(".seg[data-objfit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._set("object_fit", btn.dataset.objfit);
        btn.closest(".segwrap")?.querySelectorAll(".seg").forEach((s) => s.classList.toggle("on", s === btn));
      });
    });

    this.shadowRoot.querySelectorAll(".seg[data-ppos]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._set("preview_position", btn.dataset.ppos);
        btn.closest(".segwrap")?.querySelectorAll(".seg").forEach((s) => s.classList.toggle("on", s === btn));
      });
    });

    this.shadowRoot.querySelectorAll(".seg[data-startmode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._set("start_mode", btn.dataset.startmode);
        btn.closest(".segwrap")?.querySelectorAll(".seg").forEach((s) => s.classList.toggle("on", s === btn));
      });
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
      const v = this._clampInt(n, 1, 500);

      if (commit) {
        this._set("max_media", v);
      } else {
        this._config = this._stripAlwaysTrueKeys({
          ...this._config,
          max_media: v,
        });
      }
    };

    maxmediaEl?.addEventListener("input", () => pushMaxMedia(false), _sig);
    maxmediaEl?.addEventListener("change", () => pushMaxMedia(true), _sig);
    maxmediaEl?.addEventListener("blur", () => pushMaxMedia(true), _sig);

    this.shadowRoot.querySelectorAll(".seg[data-tbpos]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._set("thumb_bar_position", btn.dataset.tbpos);
        btn.closest(".segwrap")?.querySelectorAll(".seg").forEach((s) => s.classList.toggle("on", s === btn));
      });
    });

    this.shadowRoot.querySelectorAll(".seg[data-tlayout]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._set("thumb_layout", btn.dataset.tlayout);
        btn.closest(".segwrap")?.querySelectorAll(".seg").forEach((s) => s.classList.toggle("on", s === btn));
      });
    });

    this.shadowRoot.querySelectorAll(".seg[data-tsort]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._set("thumb_sort_order", btn.dataset.tsort);
        btn.closest(".segwrap")?.querySelectorAll(".seg").forEach((s) => s.classList.toggle("on", s === btn));
      });
    });


    $("cleanmode")?.addEventListener("change", (e) => {
      this._set("clean_mode", !!e.target.checked);
    });

    $("fullscreenzoom")?.addEventListener("change", (e) => {
      this._set("fullscreen_zoom", !!e.target.checked);
    });

    $("capture-video-thumbnails")?.addEventListener("change", (e) => {
      this._set("capture_video_thumbnails", !!e.target.checked);
    });

    $("frigate-thumb-bbox")?.addEventListener("change", (e) => {
      this._set("frigate_thumb_bbox", !!e.target.checked);
    });

    $("frigate-event-cluster")?.addEventListener("change", (e) => {
      this._set("frigate_event_cluster", !!e.target.checked);
    });

    $("frigate-event-cluster-gap-sec")?.addEventListener("change", (e) => {
      const raw = Number(e.target.value);
      const clamped = Number.isFinite(raw) ? Math.min(600, Math.max(1, Math.round(raw))) : 30;
      e.target.value = clamped;
      this._set("frigate_event_cluster_gap_sec", clamped);
    });

    $("persistentcontrols")?.addEventListener("change", (e) => {
      this._set("persistent_controls", !!e.target.checked);
    });

    this.shadowRoot.querySelectorAll(".seg[data-ctrlmode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._set("controls_mode", btn.dataset.ctrlmode);
        btn.closest(".segwrap")?.querySelectorAll(".seg").forEach((s) => s.classList.toggle("on", s === btn));
      });
    });

    $("showcameratitle")?.addEventListener("change", (e) => {
      // Unified camera-name toggle — drives both surfaces at once:
      //   - show_camera_title  → name pill in single live view
      //   - live_grid_labels   → label under each grid tile
      // Both default to `true` at the struct level, so we drop the
      // keys on "checked" and explicitly write `false` on "unchecked"
      // to keep YAML output minimal.
      const on = !!e.target.checked;
      const next = { ...(this._config ?? {}) };
      if (on) {
        delete next.show_camera_title;
        delete next.live_grid_labels;
      } else {
        next.show_camera_title = false;
        next.live_grid_labels = false;
      }
      this._commit(next, { render: true });
    });

    $("livechevrons")?.addEventListener("change", (e) => {
      // Default true at the struct level → drop the key when on, write
      // false when off. Keeps YAML minimal.
      this._set("live_chevrons_enabled", e.target.checked ? undefined : false);
    });

    $("liveautorecover")?.addEventListener("change", (e) => {
      // Default true: drop the key when on, write false when off.
      this._set("live_auto_recover", e.target.checked ? undefined : false);
    });

    $("gallerychevrons")?.addEventListener("change", (e) => {
      this._set("gallery_chevrons_enabled", e.target.checked ? undefined : false);
    });
  }

  /** Toolbar buttons, gallery and live pills, and their drag-to-reorder. Part of _render(). */
  _wirePillsAndToolbar() {
    // Toolbar buttons — switches map to the underlying show_* keys (BC),
    // ordering writes into toolbar_order (sparse). Drag-and-drop wiring
    // lives further below alongside the gallery + live pill lists.
    this.shadowRoot.querySelectorAll("[id^='toolbar-enable-']").forEach((el) => {
      el.addEventListener("change", (e) => {
        const id = el.id.replace("toolbar-enable-", "");
        this._setToolbarButtonEnabled(id, !!e.target.checked);
      });
    });

    // Gallery pills — switch + drag-handle reorder. Writes only sparse
    // overrides into `gallery_pills`: a pill returns to "no entry"
    // whenever both fields are at catalog default, so YAML stays minimal.
    this.shadowRoot.querySelectorAll("[id^='pill-enable-']").forEach((el) => {
      el.addEventListener("change", (e) => {
        const id = el.id.replace("pill-enable-", "");
        this._setGalleryPillEnabled(id, !!e.target.checked);
      });
    });

    // Live pills — same mechanism, distinct config key (live_pills) and
    // catalog (LIVE_PILL_CATALOG). IDs prefixed with `live-pill-enable-`.
    this.shadowRoot.querySelectorAll("[id^='live-pill-enable-']").forEach((el) => {
      el.addEventListener("change", (e) => {
        const id = el.id.replace("live-pill-enable-", "");
        this._setLivePillEnabled(id, !!e.target.checked);
      });
    });
    this.shadowRoot.querySelectorAll("[data-pillsalign]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        const val = btn.dataset.pillsalign;
        if (val === "center") {
          // center is the default — drop the key so YAML stays clean
          const next = { ...this._config };
          delete next.gallery_pills_align;
          this._commit(next, { render: true });
        } else if (val === "left" || val === "right") {
          this._set("gallery_pills_align", val);
        }
      });
    });
    this.shadowRoot.querySelectorAll("[data-pillsbarpos]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.pillsbarpos;
        if (val === "top") {
          // top is the default — drop the key so YAML stays clean
          const next = { ...this._config };
          delete next.bar_position;
          this._commit(next, { render: true });
        } else if (val === "bottom" || val === "hidden") {
          this._set("bar_position", val);
        }
      });
    });

    // Drag-and-drop reorder for pill rows. Mirrors the camera-tag DnD
    // pattern: mouse via native HTML5 drag events on the row, touch via
    // pointer events on the grip handle (with elementFromPoint to find
    // the row under the finger).
    const pillsList = this.shadowRoot.getElementById("pills-dnd-list");
    if (pillsList) {
      wireDragSort({
        root: pillsList,
        item: ".pill-dnd-row",
        keyOf: (el) => el.dataset.pillRow,
        grip: ".pill-drag-grip",
        onDrop: ({ src, before }) => this._reorderGalleryPillTo(src, before),
      });
    }

    // Same DnD pattern for the toolbar buttons. List id + dataset key
    // are distinct so the three reorder controllers (gallery / live /
    // toolbar) don't cross-fire on shared event types.
    const toolbarList = this.shadowRoot.getElementById("toolbar-dnd-list");
    if (toolbarList) {
      wireDragSort({
        root: toolbarList,
        item: ".pill-dnd-row",
        keyOf: (el) => el.dataset.toolbarRow,
        grip: ".pill-drag-grip",
        onDrop: ({ src, before }) => this._reorderToolbarButtonTo(src, before),
      });
    }

    // Live controls (#286): drag between Row 1, Row 2 and Menu. Built-in
    // pills can't go in the menu. Mouse drag-and-drop plus touch on the grip.
    const ctlRoot = this.shadowRoot.getElementById("live-ctl-zones");
    if (ctlRoot) {
      wireDragSort({
        root: ctlRoot,
        item: "[data-ctl-key]",
        keyOf: (el) => el.dataset.ctlKey,
        grip: ".pill-drag-grip",
        zone: "[data-ctl-zone]",
        zoneKeyOf: (el) => el.dataset.ctlZone,
        // Built-in pills can't go in the menu.
        canDrop: (src, zone) => !(zone === "menu" && src.startsWith("pill:")),
        onDrop: ({ src, before, zone }) => {
          const lists = {};
          ctlRoot.querySelectorAll("[data-ctl-zone]").forEach((z) => {
            lists[z.dataset.ctlZone] = [...z.querySelectorAll("[data-ctl-key]")]
              .map((r) => r.dataset.ctlKey)
              .filter((k) => k !== src);
          });
          const target = lists[zone] || (lists[zone] = []);
          const at = before ? target.indexOf(before) : -1;
          if (at >= 0) target.splice(at, 0, src);
          else target.push(src);
          const out = zonesToConfig(
            { row1: lists.row1 || [], row2: lists.row2 || [], menu: lists.menu || [] },
            this._config.live_pills,
            this._config.menu_buttons
          );
          const next = { ...this._config };
          if (Object.keys(out.live_pills).length) next.live_pills = out.live_pills;
          else delete next.live_pills;
          if (out.menu_buttons.length) next.menu_buttons = out.menu_buttons;
          else delete next.menu_buttons;
          this._commit(next, { render: true });
        },
      });
    }
  }

  /** Live playback, streams, talkback and trigger options. Part of _render(). */
  _wireLiveOptions({ _sig, $, autoplayEl, autoMutedEl, liveAutoMutedEl }) {
    autoplayEl?.addEventListener("change", (e) => {
      this._set("autoplay", !!e.target.checked);
    });

    autoMutedEl?.addEventListener("change", (e) => {
      this._set("auto_muted", !!e.target.checked);
    });

    liveAutoMutedEl?.addEventListener("change", (e) => {
      this._set("live_auto_muted", !!e.target.checked);
    });

    // Multi-stream URL list
    const streamList = $("stream-urls-list");
    const streamAddBtn = $("stream-url-add");

    const _getStreamRows = () => {
      if (!streamList) return [];
      return Array.from(streamList.querySelectorAll(".stream-url-row"));
    };

    const _readStreamEntries = () => {
      return _getStreamRows().map(row => {
        const si = row.dataset.si;
        const url = String(streamList.querySelector(`.stream-url-input[data-si="${si}"]`)?.value || "").trim();
        const name = String(streamList.querySelector(`.stream-name-input[data-si="${si}"]`)?.value || "").trim();
        return { url, name: name || null };
      }).filter(e => e.url);
    };

    const _saveStreamEntries = () => {
      const entries = _readStreamEntries();
      const next = { ...this._config };
      // Always use new live_stream_urls array, drop legacy single-url fields
      delete next.live_stream_url;
      delete next.live_stream_name;
      if (entries.length > 0) {
        next.live_stream_urls = entries;
      } else {
        delete next.live_stream_urls;
      }
      this._commit(next);
    };

    const _addStreamRow = (url = "", name = "") => {
      if (!streamList) return;
      const i = streamList.querySelectorAll(".stream-url-row").length;
      const div = document.createElement("div");
      div.className = "stream-url-row";
      div.dataset.si = i;
      div.style.cssText = "display:flex;flex-direction:column;gap:4px;padding:8px 0 8px 0;border-bottom:1px solid var(--divider-color,#e0e0e0);";
      div.innerHTML = `
        <div style="display:flex;gap:6px;align-items:center;">
          <input type="text" class="ed-input stream-url-input" data-si="${i}" placeholder="rtsp://192.168.1.x:554/stream" autocomplete="off" value="${url.replace(/"/g, "&quot;")}" style="flex:1;" />
          <button type="button" class="livecam-tag-del stream-url-del" data-si="${i}" style="flex-shrink:0;">×</button>
        </div>
        <input type="text" class="ed-input stream-name-input" data-si="${i}" placeholder="Name (e.g. Front door)" autocomplete="off" value="${name.replace(/"/g, "&quot;")}" />
      `;
      div.querySelector(".stream-url-del").addEventListener("click", () => {
        div.remove();
        _saveStreamEntries();
        this._scheduleRender();
      });
      div.querySelector(".stream-url-input").addEventListener("change", _saveStreamEntries, _sig);
      div.querySelector(".stream-name-input").addEventListener("change", _saveStreamEntries, _sig);
      streamList.appendChild(div);
    };

    // Bind events on existing rows (rendered in template)
    if (streamList) {
      streamList.querySelectorAll(".stream-url-del").forEach(btn => {
        btn.addEventListener("click", () => {
          btn.closest(".stream-url-row").remove();
          _saveStreamEntries();
          this._scheduleRender();
        });
      });
      streamList.querySelectorAll(".stream-url-input, .stream-name-input").forEach(inp => {
        inp.addEventListener("change", _saveStreamEntries, _sig);
      });
    }

    streamAddBtn?.addEventListener("click", () => {
      _addStreamRow();
    });

    $("live_go2rtc_url")?.addEventListener("change", (e) => {
      const val = String(e.target.value || "").trim();
      if (val) this._set("live_go2rtc_url", val);
      else { const n = { ...this._config }; delete n.live_go2rtc_url; this._commit(n); }
    });

    // Mic interaction mode (toggle vs push-to-talk). Default "toggle"
    // is the only value not stored — keeps the YAML output minimal.
    this.shadowRoot.querySelectorAll("[data-livemicmode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.livemicmode;
        if (mode === "ptt") {
          this._set("live_mic_mode", "ptt");
        } else {
          const n = { ...this._config };
          delete n.live_mic_mode;
          this._commit(n);
        }
        this._scheduleRender();
      });
    });

    // Talkback shape (bar vs round button). "bar" is the default and not
    // persisted; switching to "button" stores both shape and position so
    // the YAML stays minimal until the user opts into the round shape.
    this.shadowRoot.querySelectorAll("[data-livemicshape]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const shape = btn.dataset.livemicshape;
        if (shape === "button") {
          this._set("live_mic_shape", "button");
        } else {
          const n = { ...this._config };
          delete n.live_mic_shape;
          delete n.live_mic_button_position;
          this._commit(n);
        }
        this._scheduleRender();
      });
    });
    // Talkback position (#257). "overlay" is the default and not persisted.
    this.shadowRoot.querySelectorAll("[data-livemicpos]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pos = btn.dataset.livemicpos;
        if (pos === "below" || pos === "above") {
          this._set("live_mic_position", pos);
        } else {
          const n = { ...this._config };
          delete n.live_mic_position;
          this._commit(n);
        }
        this._scheduleRender();
      });
    });
    this.shadowRoot.querySelectorAll("[data-livemicbtnpos]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pos = btn.dataset.livemicbtnpos;
        if (pos === "center") {
          const n = { ...this._config };
          delete n.live_mic_button_position;
          this._commit(n);
        } else {
          this._set("live_mic_button_position", pos);
        }
        this._scheduleRender();
      });
    });

    // Audio-processing flags. Defaults are all true so toggling a flag ON
    // (matching the default) drops the key; only OFF values persist.
    const _setMicAp = (key, on) => {
      const n = { ...this._config };
      const ap = { ...(n.live_mic_audio_processing || {}) };
      if (on === true) {
        delete ap[key];
      } else {
        ap[key] = false;
      }
      if (Object.keys(ap).length === 0) {
        delete n.live_mic_audio_processing;
      } else {
        n.live_mic_audio_processing = ap;
      }
      this._commit(n);
    };
    $("live-mic-ec")?.addEventListener("change", (e) => _setMicAp("echo_cancellation", !!e.target.checked));
    $("live-mic-ns")?.addEventListener("change", (e) => _setMicAp("noise_suppression", !!e.target.checked));
    $("live-mic-agc")?.addEventListener("change", (e) => _setMicAp("auto_gain_control", !!e.target.checked));

    $("live-mic-wf-enabled")?.addEventListener("change", (e) => {
      this._set("live_mic_waveform_enabled", !!e.target.checked);
    });
    this.shadowRoot.querySelectorAll("[data-wfsens]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._set("live_mic_waveform_sensitivity", btn.dataset.wfsens);
      });
    });

    // HA two-way audio (2026.11): on by default, so only `false` is written.
    $("live-trig-frigate")?.addEventListener("change", (e) => {
      this._setLiveTriggers({ frigate: !!e.target.checked });
      this._scheduleRender();
    });
    $("live-trig-frigate-labels")?.addEventListener("change", (e) => {
      const labels = [...new Set(String(e.target.value || "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
      this._setLiveTriggers({ frigate_labels: labels });
    });
    $("live-trig-hold")?.addEventListener("change", (e) => {
      const raw = Number(e.target.value);
      const v = Number.isFinite(raw) ? Math.min(3600, Math.max(5, Math.round(raw))) : 30;
      e.target.value = v;
      this._setLiveTriggers({ hold_seconds: v });
    });
    $("live-trig-cooldown")?.addEventListener("change", (e) => {
      const raw = Number(e.target.value);
      const v = Number.isFinite(raw) ? Math.min(3600, Math.max(0, Math.round(raw))) : 10;
      e.target.value = v;
      this._setLiveTriggers({ cooldown_seconds: v });
    });
    this.shadowRoot.querySelectorAll("[data-livetrigreturn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._setLiveTriggers({ return_to: btn.dataset.livetrigreturn });
        this._scheduleRender();
      });
    });

    $("live-native-talk")?.addEventListener("change", (e) => {
      if (e.target.checked) {
        const next = { ...this._config };
        delete next.live_native_talk;
        this._config = next;
        this._fire();
      } else {
        this._set("live_native_talk", false);
      }
      this._scheduleRender();
    });
  }

  /** PTZ per camera. Part of _render(). */
  _wirePtz({ $ }) {
    // ─── PTZ editor wiring ─────────────────────────────────────────
    //
    // Mutations of the per-camera map go through a helper that strips
    // empty entries before writing back — the struct accepts an empty
    // map, but a blank entry left behind by a toggle off would dirty the
    // YAML output unnecessarily.
    const _setPtzCameraEntry = (camId, mutator) => {
      const n = { ...this._config };
      const map = (n.live_ptz_cameras && typeof n.live_ptz_cameras === "object")
        ? { ...n.live_ptz_cameras }
        : {};
      const cur = map[camId] ? { ...map[camId] } : null;
      const next = mutator(cur);
      if (next === null || next === undefined) {
        delete map[camId];
      } else {
        map[camId] = next;
      }
      if (Object.keys(map).length > 0) n.live_ptz_cameras = map;
      else delete n.live_ptz_cameras;
      this._commit(n, { render: true });
    };

    $("ptz-show-all")?.addEventListener("change", (e) => {
      this._ptzShowAll = !!e.target.checked;
      this._scheduleRender();
    });

    $("live_ptz_position")?.addEventListener("change", (e) => {
      const val = String(e.target.value || "bottom-left");
      this._set("live_ptz_position", val);
    });

    $("live_ptz_enabled")?.addEventListener("change", (e) => {
      const on = !!e.target.checked;
      if (on) {
        this._set("live_ptz_enabled", true);
      } else {
        const next = { ...this._config };
        delete next.live_ptz_enabled;
        this._commit(next);
      }
      this._scheduleRender();
    });

    this.shadowRoot.querySelectorAll(".ptz-cam-enable").forEach((el) => {
      el.addEventListener("change", (e) => {
        const camId = el.dataset.ptzCam;
        if (!camId) return;
        const on = !!e.target.checked;
        // Auto-detect the right dispatcher type on enable. Falls back to
        // ezviz so users on unrecognised setups still get something usable
        // out of the box (and can switch the dropdown if it's wrong).
        const detected = on && this._hass
          ? detectPtzType(camId, { states: this._hass.states, services: this._hass.services })
          : null;
        _setPtzCameraEntry(camId, () =>
          on ? { type: detected ?? "ezviz" } : null
        );
      });
    });

    this.shadowRoot.querySelectorAll(".ptz-cam-type").forEach((el) => {
      el.addEventListener("change", (e) => {
        const camId = el.dataset.ptzCam;
        if (!camId) return;
        const type = String(e.target.value || "ezviz");
        _setPtzCameraEntry(camId, (cur) => ({
          ...(cur || { presets: [] }),
          type,
        }));
      });
    });

    // Manual per-button entity pickers. `change` (not `input`) so the
    // re-render fires on blur/commit, not on every keystroke — keeps the
    // cursor put while typing. Blank clears the key (→ auto-derivation).
    const _mergeButtons = (cur, patch) => {
      const entry = { ...(cur || { type: "ezviz" }) };
      const buttons = {
        ...(entry.buttons && typeof entry.buttons === "object" ? entry.buttons : {}),
        ...patch,
      };
      for (const k of Object.keys(buttons)) {
        if (typeof buttons[k] !== "string" || buttons[k].trim() === "") delete buttons[k];
        else buttons[k] = buttons[k].trim();
      }
      if (Object.keys(buttons).length > 0) entry.buttons = buttons;
      else delete entry.buttons;
      return entry;
    };

    this.shadowRoot.querySelectorAll(".ptz-cam-button").forEach((el) => {
      el.addEventListener("change", (e) => {
        const camId = el.dataset.ptzCam;
        const key = el.dataset.ptzKey;
        if (!camId || !key) return;
        _setPtzCameraEntry(camId, (cur) => _mergeButtons(cur, { [key]: String(e.target.value || "") }));
      });
    });

    this.shadowRoot.querySelectorAll(".ptz-cam-service").forEach((el) => {
      el.addEventListener("change", (e) => {
        const camId = el.dataset.ptzCam;
        if (!camId) return;
        const service = String(e.target.value || "").trim();
        _setPtzCameraEntry(camId, (cur) => {
          const entry = { ...(cur || { type: "service" }) };
          if (service) entry.service = service;
          else delete entry.service;
          return entry;
        });
      });
    });

    this.shadowRoot.querySelectorAll(".ptz-cam-service-data").forEach((el) => {
      el.addEventListener("input", () => el.setCustomValidity(""));
      el.addEventListener("change", (e) => {
        const camId = el.dataset.ptzCam;
        const key = el.dataset.ptzKey;
        if (!camId || !key) return;
        const raw = String(e.target.value || "").trim();
        let value;
        if (raw) {
          try {
            value = JSON.parse(raw);
            if (!value || typeof value !== "object" || Array.isArray(value)) {
              throw new Error("Service data must be a JSON object");
            }
          } catch (err) {
            el.setCustomValidity(err instanceof Error ? err.message : "Invalid JSON object");
            el.reportValidity();
            return;
          }
        }
        _setPtzCameraEntry(camId, (cur) => {
          const entry = { ...(cur || { type: "service" }) };
          if (value) entry[key] = value;
          else delete entry[key];
          return entry;
        });
      });
    });

    this.shadowRoot.querySelectorAll(".ptz-detect-btn").forEach((el) => {
      el.addEventListener("click", () => {
        const camId = el.dataset.ptzCam;
        if (!camId || !this._hass) return;
        const found = detectPtzButtons(camId, { states: this._hass.states });
        _setPtzCameraEntry(camId, (cur) => _mergeButtons(cur, found));
      });
    });
  }

  /** Frigate URL, URL id, debug and YAML export. Part of _render(). */
  _wireAdvanced({ $ }) {
    $("frigate_url")?.addEventListener("change", (e) => {
      const val = String(e.target.value || "").trim().replace(/\/+$/, "");
      if (val) this._set("frigate_url", val);
      else { const n = { ...this._config }; delete n.frigate_url; this._commit(n); }
    });

    $("url_id")?.addEventListener("change", (e) => {
      const val = String(e.target.value || "").trim();
      if (val) this._set("url_id", val);
      else { const n = { ...this._config }; delete n.url_id; this._commit(n); }
    });

    $("debug-enabled")?.addEventListener("change", (e) => {
      const on = !!e.target.checked;
      if (on) {
        this._set("debug_enabled", true);
      } else {
        const next = { ...this._config };
        delete next.debug_enabled;
        this._commit(next);
      }
    });

    $("yaml-export-btn")?.addEventListener("click", () => this._exportYamlConfig());
  }

  /** Live on/off, layout, fullscreen and grid options. Part of _render(). */
  _wireLiveLayout({ $ }) {
    $("liveenabled")?.addEventListener("change", (e) => {
      const enabled = !!e.target.checked;

      if (enabled) {
        this._set("live_enabled", true);
        return;
      }

      const next = { ...this._config };
      delete next.live_default;
      delete next.live_enabled;
      delete next.live_provider;

      this._commit(next, { render: true });
    });

    this.shadowRoot.querySelectorAll(".seg[data-livelayout]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.livelayout === "grid" ? "grid" : "single";
        if (val === "single") {
          // Default — drop the key from YAML so the config stays minimal.
          const next = { ...this._config };
          delete next.live_layout;
          this._commit(next, { render: true });
        } else {
          this._set("live_layout", val);
        }
        btn.closest(".segwrap")?.querySelectorAll(".seg").forEach((s) => s.classList.toggle("on", s === btn));
      });
    });

    this.shadowRoot.querySelectorAll(".seg[data-galleryfs]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.galleryfs === "video") {
          this._set("gallery_fullscreen", "video");
        } else {
          // Overlay is the default — drop the key so the YAML stays minimal.
          const next = { ...this._config };
          delete next.gallery_fullscreen;
          this._commit(next);
        }
        btn.closest(".segwrap")?.querySelectorAll(".seg").forEach((s) => s.classList.toggle("on", s === btn));
      });
    });

    this.shadowRoot.querySelectorAll(".seg[data-livefs]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.livefs === "video" ? "video" : "card";
        if (val === "card") {
          const next = { ...this._config };
          delete next.live_fullscreen;
          this._commit(next);
        } else {
          this._set("live_fullscreen", val);
        }
        btn.closest(".segwrap")?.querySelectorAll(".seg").forEach((s) => s.classList.toggle("on", s === btn));
      });
    });

    this.shadowRoot.querySelectorAll(".seg[data-gridcols]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = Number(btn.dataset.gridcols) || 0;
        if (val === 0) {
          // Auto is the default — drop the key so the YAML stays minimal.
          const next = { ...this._config };
          delete next.live_grid_columns;
          this._commit(next);
        } else {
          this._set("live_grid_columns", val);
        }
        btn
          .closest(".segwrap")
          ?.querySelectorAll(".seg")
          .forEach((s) => s.classList.toggle("on", s === btn));
      });
    });

    this.shadowRoot.querySelectorAll(".seg[data-gridemphasis]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.gridemphasis === "top" || btn.dataset.gridemphasis === "hero"
          ? btn.dataset.gridemphasis
          : DEFAULT_LIVE_GRID_EMPHASIS;
        if (val === DEFAULT_LIVE_GRID_EMPHASIS) {
          // Bottom is the default — drop the key so the YAML stays minimal.
          const next = { ...this._config };
          delete next.live_grid_emphasis;
          this._commit(next);
        } else {
          this._set("live_grid_emphasis", val);
        }
        btn
          .closest(".segwrap")
          ?.querySelectorAll(".seg")
          .forEach((s) => s.classList.toggle("on", s === btn));
      });
    });
  }

  /** Live camera list: add, remove, mic, triggers, rotation, crop. Part of _render(). */
  _wireLiveCameras({ cameraEntities, _sig, $ }) {
    // Camera tag input for the live picker
    const livecamInput = $("livecam-input");
    const livecamSugg = $("livecam-suggestions");

    if (livecamInput && livecamSugg) {
      const renderCamSuggestions = (items) => {
        if (!items.length) { livecamSugg.hidden = true; livecamSugg.innerHTML = ""; return; }
        livecamSugg.hidden = false;
        livecamSugg.innerHTML = `
          <div class="sugg-label">Cameras</div>
          ${items.map((id) => {
            const name = (entityDisplayName(this._hass, id) || id);
            return `<button type="button" class="sugg-item" data-addcam="${id}">${name}<span style="opacity:0.45;font-weight:500;margin-left:6px;">${id}</span></button>`;
          }).join("")}
        `;
        livecamSugg.querySelectorAll("[data-addcam]").forEach((btn) => {
          btn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            addCam(btn.dataset.addcam);
          });
        });
      };

      const addCam = (id) => {
        if (!id) return;
        const liveCams = Array.isArray(this._config.live_cameras) ? this._config.live_cameras : null;
        if (liveCams && liveCams.length > 0) {
          const already = liveCams.some(
            (lc) => lc && typeof lc.entity === "string" && lc.entity.trim() === id
          );
          if (!already) {
            const next = {
              ...this._config,
              live_cameras: [...liveCams, { entity: id, name: "" }],
            };
            this._commit(next);
          }
        } else {
          const current = Array.isArray(this._config.live_camera_entities)
            ? [...this._config.live_camera_entities] : [];
          if (!current.includes(id)) {
            current.push(id);
            this._set("live_camera_entities", current);
          }
        }
        livecamInput.value = "";
        livecamSugg.hidden = true;
        livecamSugg.innerHTML = "";
        this._scheduleRender();
      };

      const getCamSuggestions = () => {
        const q = livecamInput.value.trim().toLowerCase();
        // Match whichever shape the config currently uses so suggestions
        // don't propose entities the user has already added. See the
        // addCam / delete / reorder handlers above for the same branch.
        const liveCams = Array.isArray(this._config.live_cameras) ? this._config.live_cameras : null;
        const selected = (liveCams && liveCams.length > 0)
          ? liveCams
              .map((lc) => (lc && typeof lc.entity === "string" ? lc.entity.trim() : ""))
              .filter(Boolean)
          : (Array.isArray(this._config.live_camera_entities) ? this._config.live_camera_entities : []);
        return cameraEntities.filter((id) => {
          if (selected.includes(id)) return false;
          if (!q) return true;
          return entitySearchText(this._hass, id).includes(q);
        });
      };

      livecamInput.addEventListener("focus", () => renderCamSuggestions(getCamSuggestions()), _sig);
      livecamInput.addEventListener("input", () => renderCamSuggestions(getCamSuggestions()), _sig);
      livecamInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const first = livecamSugg.querySelector("[data-addcam]");
          if (first) addCam(first.dataset.addcam);
        } else if (e.key === "Escape") {
          livecamSugg.hidden = true;
        }
      });
      livecamInput.addEventListener("blur", () => {
        setTimeout(() => { livecamSugg.hidden = true; }, 150);
      });
    }

    // Remove camera tag. Writes to whichever shape the config currently
    // uses — `live_cameras` (unified, post-#137) takes precedence, otherwise
    // we fall back to the legacy `live_camera_entities` array.
    // Live-camera row: click on header toggles expanded body (mic config).
    // Open state persists across re-renders via `_livecamRowOpen` Set so a
    // mic-input edit doesn't collapse the row mid-typing.
    this.shadowRoot.querySelectorAll("[data-livecam-toggle]").forEach((head) => {
      head.addEventListener("click", (e) => {
        // Don't toggle if user clicked an interactive child (input, button).
        if (e.target.closest("input, button, .livecam-rowgrip")) return;
        const id = head.dataset.livecamToggle;
        if (!this._livecamRowOpen) this._livecamRowOpen = new Set();
        if (this._livecamRowOpen.has(id)) this._livecamRowOpen.delete(id);
        else this._livecamRowOpen.add(id);
        head.parentElement?.classList.toggle("open");
      });
    });

    // Mic-stream input per camera — writes the value back into the matching
    // `live_cameras` entry. Uses `change` (not `input`) so we don't fire a
    // config-changed event per keystroke and steal focus during typing.
    // Empty/whitespace removes the `mic` field rather than storing "".
    this.shadowRoot.querySelectorAll("[data-mic-cam]").forEach((inp) => {
      inp.addEventListener("change", (e) => {
        const id = e.target.dataset.micCam;
        const value = String(e.target.value || "").trim();
        this._updateLiveCamera(id, { mic: value });
        // Update the row's mic-summary label live without a full re-render.
        const row = e.target.closest(".livecam-row");
        const summary = row?.querySelector(".livecam-rowmic");
        if (summary) {
          summary.textContent = value || "no mic";
          summary.classList.toggle("none", !value);
        }
      });
    });

    // Trigger entities per camera — comma or space separated entity ids,
    // written to `live_cameras[].triggers`. Empty removes the key.
    this.shadowRoot.querySelectorAll("[data-trig-cam]").forEach((inp) => {
      inp.addEventListener("change", (e) => {
        const id = e.target.dataset.trigCam;
        const ids = [...new Set(String(e.target.value || "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
        this._updateLiveCamera(id, { triggers: ids.length ? ids : undefined });
      });
    });

    // Rotation per camera — writes `live_cameras[].rotation`; 0 removes it.
    this.shadowRoot.querySelectorAll("[data-rotcam]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.rotcam;
        const rot = normalizeRotation(btn.dataset.rot);
        this._updateLiveCamera(id, { rotation: rot || undefined }, { render: true });
      });
    });

    this._wireLivecamCropInline();

    this.shadowRoot.querySelectorAll("[data-delcam]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.delcam;
        // Clean up transient inline-crop state for the removed camera so
        // the Maps/Sets don't keep growing across edits.
        this._livecamCropAspect?.delete(id);
        this._livecamCropDetectedAR?.delete(id);
        this._livecamCropOpen?.delete(id);
        const liveCams = Array.isArray(this._config.live_cameras) ? this._config.live_cameras : null;
        if (liveCams && liveCams.length > 0) {
          const filtered = liveCams.filter(
            (lc) => !(lc && typeof lc.entity === "string" && lc.entity.trim() === id)
          );
          const next = { ...this._config };
          if (filtered.length === 0) delete next.live_cameras;
          else next.live_cameras = filtered;
          this._commit(next, { render: true });
          return;
        }
        const current = Array.isArray(this._config.live_camera_entities)
          ? [...this._config.live_camera_entities] : [];
        const idx = current.indexOf(id);
        if (idx >= 0) current.splice(idx, 1);
        if (current.length === 0) {
          const next = { ...this._config };
          delete next.live_camera_entities;
          this._config = next;
          this._fire();
        } else {
          this._set("live_camera_entities", current);
        }
        this._scheduleRender();
      });
    });
  }

  /** Menu buttons and long-press thumbnail actions. Part of _render(). */
  _wireMenuButtonsAndThumbActions({ _sig, $ }) {
    // Icon autocomplete helpers
    const COMMON_ICONS = ["mdi:lightbulb","mdi:lightbulb-outline","mdi:lightbulb-off","mdi:lightbulb-on","mdi:lamp","mdi:ceiling-light","mdi:floor-lamp","mdi:led-strip","mdi:string-lights","mdi:lock","mdi:lock-open","mdi:lock-outline","mdi:lock-open-outline","mdi:lock-smart","mdi:shield-home","mdi:shield","mdi:door-open","mdi:door-closed","mdi:window-open","mdi:window-closed","mdi:garage","mdi:garage-open","mdi:gate","mdi:gate-open","mdi:thermostat","mdi:thermometer","mdi:fan","mdi:fan-off","mdi:air-conditioner","mdi:radiator","mdi:snowflake","mdi:heat-wave","mdi:home","mdi:home-outline","mdi:home-away","mdi:sleep","mdi:run","mdi:power","mdi:power-off","mdi:toggle-switch","mdi:toggle-switch-off","mdi:electric-switch","mdi:outlet","mdi:television","mdi:television-off","mdi:play","mdi:pause","mdi:stop","mdi:volume-high","mdi:volume-off","mdi:music","mdi:speaker","mdi:camera","mdi:cctv","mdi:motion-sensor","mdi:motion-sensor-off","mdi:smoke-detector","mdi:bell","mdi:bell-off","mdi:alert","mdi:robot-vacuum","mdi:washing-machine","mdi:dishwasher","mdi:coffee","mdi:car","mdi:car-connected","mdi:ev-station","mdi:water","mdi:water-off","mdi:pool","mdi:sprinkler","mdi:blinds","mdi:blinds-open","mdi:curtains","mdi:curtains-closed","mdi:ceiling-fan","mdi:ceiling-fan-light","mdi:battery","mdi:battery-charging","mdi:wifi","mdi:bluetooth","mdi:account","mdi:account-outline","mdi:account-group","mdi:star","mdi:heart","mdi:check","mdi:close","mdi:plus","mdi:minus","mdi:pencil","mdi:delete","mdi:refresh","mdi:eye","mdi:eye-off","mdi:flash","mdi:flash-off","mdi:weather-sunny","mdi:weather-night","mdi:weather-cloudy","mdi:chart-line","mdi:information","mdi:cog","mdi:tools"];

    // Keep the little icon in front of an icon field in step with its text.
    const syncIconPreview = (input) => {
      const preview = input?.parentElement?.querySelector(":scope > .icon-preview");
      if (preview) preview.setAttribute("icon", String(input.value || "").trim());
    };

    const wireIconInput = (input, sugg, onSelect) => {
      if (!input || !sugg) return;
      const getSuggestions = (q) => {
        const lq = (q || "").toLowerCase().replace(/^mdi:/, "");
        const all = COMMON_ICONS;
        if (!lq) return all.slice(0, 30);
        return all.filter(ic => ic.replace("mdi:", "").includes(lq)).slice(0, 30);
      };
      const renderIconSugg = (icons) => {
        if (!icons.length) { sugg.hidden = true; sugg.innerHTML = ""; return; }
        sugg.hidden = false;
        sugg.innerHTML = icons.map(ic =>
          `<button type="button" class="sugg-item" data-pick-icon="${ic}" style="display:flex;align-items:center;gap:8px;"><ha-icon icon="${ic}" style="--mdc-icon-size:18px;flex-shrink:0;"></ha-icon><span>${ic.replace("mdi:","")}</span></button>`
        ).join("");
        sugg.querySelectorAll("[data-pick-icon]").forEach(btn => {
          btn.addEventListener("mousedown", (e) => { e.preventDefault(); onSelect(btn.dataset.pickIcon); syncIconPreview(input); }, _sig);
        });
      };
      input.addEventListener("focus", () => renderIconSugg(getSuggestions(input.value)), _sig);
      input.addEventListener("input", () => {
        syncIconPreview(input);
        renderIconSugg(getSuggestions(input.value));
      }, _sig);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); const first = sugg.querySelector("[data-pick-icon]"); if (first) onSelect(first.dataset.pickIcon); }
        else if (e.key === "Escape") { sugg.hidden = true; }
      });
      input.addEventListener("blur", () => { setTimeout(() => { sugg.hidden = true; }, 150); }, _sig);
    };

    // Remove menu button.
    this.shadowRoot.querySelectorAll("[data-delmenubutton]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.delmenubutton);
        const current = Array.isArray(this._config.menu_buttons) ? [...this._config.menu_buttons] : [];
        current.splice(i, 1);
        this._set("menu_buttons", current);
        this._scheduleRender();
      });
    });

    // Edit menu button fields inline (entity autocomplete + icon/title/service/state_on)
    const allEntityIds = Object.keys(this._hass?.states || {}).sort();
    const entitySuggestions = (q) => {
      const lq = q.toLowerCase();
      return allEntityIds.filter((id) => {
        return !lq || entitySearchText(this._hass, id).includes(lq);
      }).slice(0, 30);
    };

    const wireEntityInput = (input, sugg, onSelect) => {
      if (!input || !sugg) return;
      const render = (ids) => {
        if (!ids.length) { sugg.hidden = true; sugg.innerHTML = ""; return; }
        sugg.hidden = false;
        sugg.innerHTML = ids.map((id) => {
          const name = (entityDisplayName(this._hass, id) || id);
          return `<button type="button" class="sugg-item" data-pick-entity="${id}" style="display:flex;align-items:center;gap:8px;"><ha-icon icon="${this._entityIcon(id)}" style="--mdc-icon-size:18px;flex-shrink:0;"></ha-icon><span>${name}<span style="opacity:0.45;font-weight:500;margin-left:6px;">${id}</span></span></button>`;
        }).join("");
        sugg.querySelectorAll("[data-pick-entity]").forEach((btn) => {
          btn.addEventListener("mousedown", (e) => { e.preventDefault(); onSelect(btn.dataset.pickEntity); }, _sig);
        });
      };
      input.addEventListener("focus", () => render(entitySuggestions(input.value)), _sig);
      input.addEventListener("input", () => render(entitySuggestions(input.value)), _sig);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); const first = sugg.querySelector("[data-pick-entity]"); if (first) onSelect(first.dataset.pickEntity); }
        else if (e.key === "Escape") { sugg.hidden = true; }
      });
      input.addEventListener("blur", () => { setTimeout(() => { sugg.hidden = true; }, 150); }, _sig);
    };

    // Per-button entity autocomplete
    this.shadowRoot.querySelectorAll("input[data-menubtn-entity]").forEach((input) => {
      const i = Number(input.dataset.menubtnEntity);
      const sugg = this.shadowRoot.querySelector(`[data-menubtn-entity-sugg="${i}"]`);
      const onPick = (id) => {
        input.value = id;
        if (sugg) sugg.hidden = true;
        if (!id) return;
        const current = Array.isArray(this._config.menu_buttons) ? [...this._config.menu_buttons] : [];
        if (!current[i]) return;
        const prevEntity = current[i].entity;
        const next = { ...current[i], entity: id };
        // Follow the entity's icon unless the user picked their own (#287).
        const icon = iconAfterEntityChange({
          currentIcon: next.icon,
          previousDefault: this._entityIcon(prevEntity),
          nextDefault: this._entityIcon(id),
        });
        if (icon) next.icon = icon;
        current[i] = next;
        this._set("menu_buttons", current);
        this._scheduleRender();
      };
      if (!this._mountHaEntityPicker(input, sugg, onPick)) wireEntityInput(input, sugg, onPick);
    });

    // Menu-button icon autocomplete (per existing button).
    this.shadowRoot.querySelectorAll("input[data-menubtn][data-mbfield='icon']").forEach((input) => {
      const i = Number(input.dataset.menubtn);
      const sugg = this.shadowRoot.querySelector(`[data-menubtn-icon-sugg="${i}"]`);
      wireIconInput(input, sugg, (ic) => {
        input.value = ic;
        if (sugg) sugg.hidden = true;
        const current = Array.isArray(this._config.menu_buttons) ? [...this._config.menu_buttons] : [];
        if (!current[i]) return;
        current[i] = { ...current[i], icon: ic };
        this._set("menu_buttons", current);
      });
    });
    this.shadowRoot.querySelectorAll("input[data-menubtn][data-mbfield='icon_on']").forEach((input) => {
      const i = Number(input.dataset.menubtn);
      const sugg = this.shadowRoot.querySelector(`[data-menubtn-iconon-sugg="${i}"]`);
      wireIconInput(input, sugg, (ic) => {
        input.value = ic;
        if (sugg) sugg.hidden = true;
        const current = Array.isArray(this._config.menu_buttons) ? [...this._config.menu_buttons] : [];
        if (!current[i]) return;
        current[i] = { ...current[i], icon_on: ic };
        this._set("menu_buttons", current);
      });
    });

    // Edit menu button fields inline (title, service, state_on)
    this.shadowRoot.querySelectorAll("input[data-menubtn][data-mbfield]").forEach((input) => {
      // Icons typed by hand (not picked from the list) are saved here too.
      input.addEventListener("change", () => {
        const i = Number(input.dataset.menubtn);
        const field = input.dataset.mbfield;
        const current = Array.isArray(this._config.menu_buttons) ? [...this._config.menu_buttons] : [];
        if (!current[i]) return;
        const updated = { ...current[i] };
        const val = input.value.trim();
        // The off-icon is required; an emptied field keeps the saved icon.
        if (!val && field === "icon") return;
        if (val === (current[i][field] ?? "")) return;
        if (val) updated[field] = val;
        else delete updated[field];
        current[i] = updated;
        this._set("menu_buttons", current);
      });
    });

    // Add menu button.
    const menubtnEntityInput = $("menubtn-entity-input");
    const menubtnEntitySugg = $("menubtn-entity-sugg");
    const menubtnIconInput = $("menubtn-icon-input");
    const menubtnAddBtn = $("menubtn-add-btn");

    const onPickNew = (id) => {
      if (menubtnEntityInput) menubtnEntityInput.value = id;
      if (menubtnEntitySugg) menubtnEntitySugg.hidden = true;
      // Follow the entity's icon unless the user typed their own (#287).
      if (id && menubtnIconInput) {
        const icon = iconAfterEntityChange({
          currentIcon: menubtnIconInput.value,
          previousDefault: this._entityIcon(this._menubtnNewEntity),
          nextDefault: this._entityIcon(id),
        });
        if (icon) {
          menubtnIconInput.value = icon;
          syncIconPreview(menubtnIconInput);
        }
      }
      this._menubtnNewEntity = id;
    };
    if (!this._mountHaEntityPicker(menubtnEntityInput, menubtnEntitySugg, onPickNew)) {
      wireEntityInput(menubtnEntityInput, menubtnEntitySugg, onPickNew);
    }

    const menubtnIconSugg = $("menubtn-icon-sugg");
    wireIconInput(menubtnIconInput, menubtnIconSugg, (ic) => {
      if (menubtnIconInput) menubtnIconInput.value = ic;
      if (menubtnIconSugg) menubtnIconSugg.hidden = true;
    });

    if (menubtnAddBtn) {
      menubtnAddBtn.addEventListener("click", () => {
        const entity = (menubtnEntityInput?.value || "").trim();
        const icon = (menubtnIconInput?.value || "").trim();
        if (!entity || !icon) return;
        const current = Array.isArray(this._config.menu_buttons) ? [...this._config.menu_buttons] : [];
        current.push({ entity, icon });
        this._set("menu_buttons", current);
        if (menubtnEntityInput) menubtnEntityInput.value = "";
        if (menubtnIconInput) menubtnIconInput.value = "";
        this._scheduleRender();
      });
    }

    // ── Long-press actions (`thumb_actions`, #243) ──
    const _getThumbActions = () =>
      Array.isArray(this._config.thumb_actions) ? this._config.thumb_actions.map((a) => ({ ...a })) : [];
    const _setThumbActions = (arr, rerender) => {
      if (arr.length) {
        this._set("thumb_actions", arr);
      } else {
        const next = { ...this._config };
        delete next.thumb_actions;
        this._config = next;
        this._fire();
      }
      if (rerender) this._scheduleRender();
    };
    const SERVICE_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/i;

    this.shadowRoot.querySelectorAll("input[data-ta][data-ta-field]").forEach((input) => {
      const i = Number(input.dataset.ta);
      const field = input.dataset.taField;
      if (field === "icon") {
        const sugg = this.shadowRoot.querySelector(`[data-ta-icon-sugg="${i}"]`);
        wireIconInput(input, sugg, (ic) => {
          input.value = ic;
          if (sugg) sugg.hidden = true;
          const arr = _getThumbActions();
          if (!arr[i]) return;
          arr[i].icon = ic;
          _setThumbActions(arr);
        });
      }
      input.addEventListener("input", () => input.setCustomValidity(""), _sig);
      input.addEventListener("change", () => {
        const arr = _getThumbActions();
        if (!arr[i]) return;
        const val = input.value.trim();
        if ((field === "name" || field === "perform_action") && !val) {
          input.setCustomValidity("Required");
          input.reportValidity();
          return;
        }
        if (field === "perform_action" && !SERVICE_RE.test(val)) {
          input.setCustomValidity("Use domain.service, e.g. script.archive_clip");
          input.reportValidity();
          return;
        }
        if (val) arr[i][field] = val;
        else delete arr[i][field];
        _setThumbActions(arr, field === "name");
      }, _sig);
    });

    this.shadowRoot.querySelectorAll("textarea[data-ta-data]").forEach((el) => {
      const i = Number(el.dataset.taData);
      el.addEventListener("input", () => el.setCustomValidity(""), _sig);
      el.addEventListener("change", () => {
        const arr = _getThumbActions();
        if (!arr[i]) return;
        const raw = String(el.value || "").trim();
        if (!raw) {
          delete arr[i].data;
          _setThumbActions(arr);
          return;
        }
        let value;
        try {
          value = JSON.parse(raw);
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("Data must be a JSON object, e.g. {\"path\":\"{path}\"}");
          }
        } catch (err) {
          el.setCustomValidity(err instanceof Error ? err.message : "Invalid JSON object");
          el.reportValidity();
          return;
        }
        arr[i].data = value;
        _setThumbActions(arr);
      }, _sig);
    });

    this.shadowRoot.querySelectorAll("input[data-ta-confirm]").forEach((input) => {
      input.addEventListener("change", () => {
        const i = Number(input.dataset.taConfirm);
        const arr = _getThumbActions();
        if (!arr[i]) return;
        if (input.checked) arr[i].confirmation = true;
        else delete arr[i].confirmation;
        _setThumbActions(arr);
      }, _sig);
    });

    this.shadowRoot.querySelectorAll("[data-ta-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const arr = _getThumbActions();
        arr.splice(Number(btn.dataset.taDel), 1);
        _setThumbActions(arr, true);
      }, _sig);
    });

    const taAddBtn = $("ta-add-btn");
    if (taAddBtn) {
      taAddBtn.addEventListener("click", () => {
        const nameEl = $("ta-add-name");
        const actionEl = $("ta-add-action");
        const name = (nameEl?.value || "").trim();
        const perform_action = (actionEl?.value || "").trim();
        if (!name) {
          nameEl?.setCustomValidity("Required");
          nameEl?.reportValidity();
          return;
        }
        if (!SERVICE_RE.test(perform_action)) {
          actionEl?.setCustomValidity("Use domain.service, e.g. script.archive_clip");
          actionEl?.reportValidity();
          return;
        }
        const arr = _getThumbActions();
        arr.push({ name, perform_action, data: { path: "{path}" } });
        _setThumbActions(arr, true);
      }, _sig);
      [$("ta-add-name"), $("ta-add-action")].forEach((el) =>
        el?.addEventListener("input", () => el.setCustomValidity(""), _sig)
      );
    }
  }

  /** Drag-to-reorder for the live camera chips. Part of _render(). */
  _wireLiveCameraReorder() {
    // Drag-and-drop reorder for the live_camera_entities chips (mouse + touch)
    const dndContainer = this.shadowRoot.getElementById("livecam-tags-dnd");
    if (dndContainer) {
      let dragSrcId = null;


      const doReorder = (targetId) => {
        if (!dragSrcId || dragSrcId === targetId) return;
        const liveCams = Array.isArray(this._config.live_cameras) ? this._config.live_cameras : null;
        if (liveCams && liveCams.length > 0) {
          // Unified shape — move the entity-typed entry within the array.
          // Url-typed entries keep their slots; only entity entries shuffle
          // relative to each other (the drag UI only lists entity chips).
          const arr = [...liveCams];
          const findEntityIdx = (id) =>
            arr.findIndex((lc) => lc && typeof lc.entity === "string" && lc.entity.trim() === id);
          const fromIdx = findEntityIdx(dragSrcId);
          const toIdx = findEntityIdx(targetId);
          if (fromIdx < 0 || toIdx < 0) return;
          const [moved] = arr.splice(fromIdx, 1);
          arr.splice(toIdx, 0, moved);
          const next = { ...this._config, live_cameras: arr };
          this._commit(next, { render: true });
          return;
        }
        const current = Array.isArray(this._config.live_camera_entities)
          ? [...this._config.live_camera_entities] : [];
        const fromIdx = current.indexOf(dragSrcId);
        const toIdx = current.indexOf(targetId);
        if (fromIdx < 0 || toIdx < 0) return;
        current.splice(fromIdx, 1);
        current.splice(toIdx, 0, dragSrcId);
        this._set("live_camera_entities", current);
        this._scheduleRender();
      };

      wireDragSort({
        root: dndContainer,
        item: "[data-dragcam]",
        keyOf: (el) => el.dataset.dragcam,
        grip: ".livecam-rowgrip",
        draggingClass: "dnd-dragging",
        overClass: "dnd-over",
        onDrop: ({ src, before }) => {
          dragSrcId = src;
          doReorder(before);
        },
      });
    }
  }

  /** Thumbnail frame position slider. Part of _render(). */
  _wireThumbFramePct({ thumbpctEl, thumbpctvalEl }) {
    const updateThumbPctVal = (v) => {
      if (thumbpctvalEl) thumbpctvalEl.textContent = `${v}%`;
    };

    thumbpctEl?.addEventListener("input", (e) => {
      updateThumbPctVal(Number(e.target.value));
    });

    thumbpctEl?.addEventListener("change", (e) => {
      const v = Number(e.target.value);
      updateThumbPctVal(v);
      this._set(
        "thumbnail_frame_pct",
        Number.isFinite(v) ? Math.round(v) : DEFAULT_THUMBNAIL_FRAME_PCT
      );
    });
  }

  /** The media folder browser. Part of _render(). */
  _wireMediaBrowser({ $ }) {
    $("browser-backdrop")?.addEventListener("click", () => {
      this._closeMediaBrowser();
    });

    $("browser-close")?.addEventListener("click", () => {
      this._closeMediaBrowser();
    });

    $("browser-back")?.addEventListener("click", async () => {
      await this._mediaBrowserGoBack();
    });

    $("browser-select-current")?.addEventListener("click", () => {
      if (!this._mediaBrowserPath) return;
      this._appendMediaSourceValue(this._mediaBrowserPath);
      this._closeMediaBrowser();
    });

    this.shadowRoot.querySelectorAll("[data-browser-open]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const nextPath = btn.dataset.browserOpen || "";
        if (!nextPath) return;
        await this._loadMediaBrowser(nextPath, true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-browser-select]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.browserSelect || "";
        if (!value) return;
        this._appendMediaSourceValue(value);
        this._closeMediaBrowser();
      });
    });
  }

  /** The media folder browser overlay. Part of _render(). */
  _renderMediaBrowser() {
    return this._mediaBrowserOpen
      ? `
        <div class="browser-backdrop" id="browser-backdrop"></div>
        <div class="browser-modal" role="dialog" aria-modal="true" aria-label="Browse media folders">
          <div class="browser-head">
            <div class="browser-head-copy">
              <div class="browser-title">Browse folders</div>
              <div class="browser-path">${this._mediaBrowserPath || "—"}</div>
            </div>
            <button type="button" class="browser-iconbtn" id="browser-close" title="Close">
              ${svgIcon('mdi:close', 18)}
            </button>
          </div>

          <div class="browser-toolbar">
            <button
              type="button"
              class="browser-btn ${this._mediaBrowserHistory.length ? "" : "disabled"}"
              id="browser-back"
              ${this._mediaBrowserHistory.length ? "" : "disabled"}
            >
              ${svgIcon('mdi:arrow-left', 18)}
              <span>Back</span>
            </button>

            <button
              type="button"
              class="browser-btn primary"
              id="browser-select-current"
              ${this._mediaBrowserPath ? "" : "disabled"}
            >
              ${svgIcon('mdi:check', 18)}
              <span>Use current folder</span>
            </button>
          </div>

          <div class="browser-body">
            ${
              this._mediaBrowserLoading
                ? `<div class="browser-empty">Loading folders…</div>`
                : this._mediaBrowserItems.length
                  ? `
                    <div class="browser-list">
                      ${this._mediaBrowserItems
                        .map(
                          (item) => `
                            <div class="browser-item">
                              <button
                                type="button"
                                class="browser-open"
                                data-browser-open="${item.id.replace(/"/g, "&quot;")}"
                                title="${item.id.replace(/"/g, "&quot;")}"
                              >
                                <span class="browser-open-icon">
                                  ${svgIcon('mdi:folder-outline', 20)}
                                </span>
                                <span class="browser-open-copy">
                                  <span class="browser-open-title">${item.title}</span>
                                  <span class="browser-open-sub">${item.id}</span>
                                </span>
                              </button>

                              <button
                                type="button"
                                class="browser-select"
                                data-browser-select="${item.id.replace(/"/g, "&quot;")}"
                                title="Select folder"
                              >
                                Select
                              </button>
                            </div>
                          `
                        )
                        .join("")}
                    </div>
                  `
                  : `<div class="browser-empty">No folders found here.</div>`
            }
          </div>
        </div>
      `
      : ``;
  }

  /** The Styling tab. Part of _render(). */
  _renderStylingTab() {
    return `
      <div class="tabpanel" data-panel="styling">
        <div class="style-sections">
          ${STYLE_SECTIONS.map((section) => `
            <details
              class="style-section"
              id="style-section-${section.id}"
              ${this._openStyleSections.has(section.id) ? "open" : ""}
            >
              <summary class="style-section-head">
                ${svgIcon(section.icon, 18)}
                <span>${section.label}</span>
                <span class="style-chevron">${svgIcon('mdi:chevron-down', 18)}</span>
              </summary>
              <div class="style-section-body">
                <div class="color-grid">
                  ${section.controls.map((ctrl) => {
                    if (ctrl.type === "color") {
                      return `
                        <div class="color-row">
                          <div class="lbl">${ctrl.label}</div>
                          <div class="color-controls">
                            <div id="${ctrl.hostId}"></div>
                            <label class="color-transparent">
                              <input type="checkbox" data-transparent="${ctrl.variable}">
                              Transparent
                            </label>
                            <button type="button" class="color-reset" data-reset="${ctrl.variable}" title="Reset to default">
                              ${svgIcon('mdi:backup-restore', 16)}
                            </button>
                          </div>
                        </div>
                      `;
                    }
                    if (ctrl.type === "radius") {
                      const raw = this._getStyleVariableValue(ctrl.variable);
                      const val = raw ? parseInt(raw) : ctrl.default;
                      const safeId = ctrl.variable.replace(/[^a-z0-9]/gi, "-");
                      return `
                        <div class="color-row">
                          <div class="lbl">${ctrl.label}</div>
                          <div class="color-controls">
                            <input
                              type="range"
                              class="radius-range"
                              data-radius="${ctrl.variable}"
                              data-radius-mirror-id="radius-num-${safeId}"
                              min="${ctrl.min}"
                              max="${ctrl.max}"
                              value="${val}"
                            >
                            <span class="radius-value-wrap" id="radius-val-${safeId}">
                              <input
                                type="number"
                                class="radius-value-input"
                                id="radius-num-${safeId}"
                                data-radius-input="${ctrl.variable}"
                                data-radius-default="${ctrl.default}"
                                min="${ctrl.min}"
                                max="${ctrl.max}"
                                step="1"
                                value="${val}"
                              >
                              <span class="radius-value-unit">px</span>
                            </span>
                            <button type="button" class="color-reset" data-reset="${ctrl.variable}" title="Reset to default">
                              ${svgIcon('mdi:backup-restore', 16)}
                            </button>
                          </div>
                        </div>
                      `;
                    }
                    if (ctrl.type === "select") {
                      const current = String(this._config?.[ctrl.configKey] || ctrl.options[0].value);
                      const isDisabled = ctrl.disabledFn ? ctrl.disabledFn(this._config || {}) : false;
                      const opts = ctrl.options.map((o) => `<option value="${o.value}" ${current === o.value ? "selected" : ""}>${o.label}</option>`).join("");
                      return `
                        <div class="color-row ${isDisabled ? "muted" : ""}">
                          <div class="lbl">${ctrl.label}</div>
                          <div class="selectwrap" style="min-width:120px">
                            <select class="select" data-seg-key="${ctrl.configKey}" ${isDisabled ? "disabled" : ""}>${opts}</select>
                            <span class="selarrow"></span>
                          </div>
                        </div>
                      `;
                    }
                    if (ctrl.type === "slider") {
                      const n = Number(this._config?.[ctrl.configKey]);
                      const val = Number.isFinite(n) ? Math.min(ctrl.max, Math.max(ctrl.min, n)) : ctrl.default;
                      return `
                        <div class="color-row">
                          <div class="lbl">${ctrl.label}</div>
                          <div class="color-controls">
                            <input
                              type="range"
                              class="radius-range"
                              data-config-slider="${ctrl.configKey}"
                              data-slider-val-id="${ctrl.valId}"
                              data-slider-unit="${ctrl.unit}"
                              data-slider-default="${ctrl.default}"
                              data-slider-mirror-id="${ctrl.id}-num"
                              id="${ctrl.id}"
                              min="${ctrl.min}"
                              max="${ctrl.max}"
                              value="${val}"
                            >
                            <span class="radius-value-wrap" id="${ctrl.valId}" data-slider-unit="${ctrl.unit}">
                              <input
                                type="number"
                                class="radius-value-input"
                                id="${ctrl.id}-num"
                                data-slider-input="${ctrl.configKey}"
                                data-slider-target="${ctrl.id}"
                                data-slider-default="${ctrl.default}"
                                min="${ctrl.min}"
                                max="${ctrl.max}"
                                step="1"
                                value="${val}"
                              >
                              <span class="radius-value-unit">${ctrl.unit}</span>
                            </span>
                            <button type="button" class="color-reset" data-slider-reset="${ctrl.configKey}" data-slider-default="${ctrl.default}" title="Reset to default">
                              ${svgIcon('mdi:backup-restore', 16)}
                            </button>
                          </div>
                        </div>
                      `;
                    }
                    return "";
                  }).join("")}
                </div>
              </div>
            </details>
          `).join("")}
        </div>
      </div>
    `;
  }

  /** The Source tab. Part of _render(). */
  _renderSourceTab({
    startMode,
    sensorModeOn,
    mediaModeOn,
    combinedModeOn,
    invalidEntities,
    mediaHasFile,
    v2ExpandToggle,
    v2Collapsible,
  }) {
    const viewBody = `
        <div class="row">
          <div class="lbl">Default view</div>
          <div class="desc">Which screen the card opens on. <code>Gallery</code> shows recorded clips; <code>Live</code> shows the camera feed; <code>Hybrid</code> shows live with a side drawer of clips.</div>
          <div class="segwrap">
            <button class="seg ${startMode !== "live" && startMode !== "hybrid" ? "on" : ""}" data-startmode="gallery">Gallery</button>
            <button class="seg ${startMode === "live" ? "on" : ""}" data-startmode="live">Live</button>
            <button class="seg ${startMode === "hybrid" ? "on" : ""}" data-startmode="hybrid">Hybrid</button>
          </div>
        </div>
        <div class="row">
          <div class="lbl">Deep-link id <span style="font-weight:400;color:var(--ed-text2);font-size:0.85em;">(optional)</span></div>
          <div class="desc">Opt-in id that names this card in a URL, for HA notification actions. When set, a link like <code>?cgc_id=porch&amp;cgc_camera=camera.porch_gate</code> opens straight into live view on that camera, or <code>?cgc_id=porch&amp;cgc_view=gallery</code> opens the gallery on the newest clip. Blank means the card ignores URL parameters entirely.</div>
          <div class="field">
            <input type="text" class="ed-input" id="url_id" placeholder="e.g. porch" autocomplete="off" value="${this._config.url_id || ""}" />
          </div>
        </div>
      `;

    const sourceBody = `
        <div class="row">
          <div class="lbl">Source mode</div>
          <div class="desc">Where the card pulls clips from. <code>File sensor</code> reads from a sensor entity; <code>Media folders</code> walks Home Assistant's media-source tree; <code>Combined</code> merges both.</div>
          <div class="segwrap">
            <button class="seg ${sensorModeOn ? "on" : ""}" data-src="sensor">File sensor</button>
            <button class="seg ${mediaModeOn ? "on" : ""}" data-src="media">Media folders</button>
            <button class="seg ${combinedModeOn ? "on" : ""}" data-src="combined">Combined</button>
          </div>
        </div>

        ${sensorModeOn ? `
        <div class="row">
          <div class="field" id="entities-field">
            <textarea id="entities" rows="4" placeholder="Enter one sensor per line"></textarea>
            <div class="suggestions" id="entities-suggestions" hidden></div>
          </div>
          ${invalidEntities.length ? `<div class="desc">⚠️ Invalid / missing sensor(s): <code>${invalidEntities.join("</code>, <code>")}</code></div>` : ``}
          ${this._renderFilesWizard()}
        </div>
        ` : mediaModeOn ? `
        <div class="row">
          <div class="field" id="mediasources-field">
            <textarea id="mediasources" rows="4" placeholder="Enter one folder per line, or browse and select folders"></textarea>
            <div class="suggestions" id="mediasources-suggestions" hidden></div>
          </div>
          <div class="row-actions">
            <button type="button" class="actionbtn" id="browse-media-folders">${svgIcon('mdi:folder-search-outline', 18)}<span>Browse</span></button>
            <button type="button" class="actionbtn" id="clear-media-folders">${svgIcon('mdi:delete-outline', 18)}<span>Clear</span></button>
          </div>
          ${mediaHasFile ? `<div class="desc">⚠️ One of your entries looks like a file (extension). This field expects folders.</div>` : ``}
        </div>
        ` : `
        <div class="row">
          <div class="lbl">File sensors</div>
          <div class="field" id="entities-field">
            <textarea id="entities" rows="3" placeholder="Enter one sensor per line"></textarea>
            <div class="suggestions" id="entities-suggestions" hidden></div>
          </div>
          ${invalidEntities.length ? `<div class="desc">⚠️ Invalid / missing sensor(s): <code>${invalidEntities.join("</code>, <code>")}</code></div>` : ``}
        </div>
        <div class="row">
          <div class="lbl">Media folders</div>
          <div class="field" id="mediasources-field">
            <textarea id="mediasources" rows="3" placeholder="Enter one folder per line, or browse and select folders"></textarea>
            <div class="suggestions" id="mediasources-suggestions" hidden></div>
          </div>
          <div class="row-actions">
            <button type="button" class="actionbtn" id="browse-media-folders">${svgIcon('mdi:folder-search-outline', 18)}<span>Browse</span></button>
            <button type="button" class="actionbtn" id="clear-media-folders">${svgIcon('mdi:delete-outline', 18)}<span>Clear</span></button>
          </div>
          ${mediaHasFile ? `<div class="desc">⚠️ One of your entries looks like a file (extension). This field expects folders.</div>` : ``}
        </div>
        `}
      `;

    const frigateBody = `
        <div class="row">
          <div class="lbl">Frigate URL <span style="font-weight:400;color:var(--ed-text2);font-size:0.85em;">(optional)</span></div>
          <div class="desc">Direct URL to your Frigate API (e.g. <code>http://192.168.1.x:5000</code>). When set, clips load through Frigate's REST API — much faster than crawling Home Assistant's media tree folder by folder.</div>
          <div class="field">
            <input type="text" class="ed-input" id="frigate_url" placeholder="http://192.168.1.x:5000" autocomplete="off" value="${this._config.frigate_url || ""}" />
          </div>
        </div>
        <div class="row">
          <div class="row-head">
            <div>
              <div class="lbl">Bounding box on thumbs</div>
              <div class="desc">Use Frigate's annotated snapshot for gallery thumbs instead of the plain thumbnail. Requires <code>snapshots.bounding_box: true</code> in your Frigate camera config.</div>
            </div>
            <div class="togrow">
              <label class="cgc-switch"><input type="checkbox" id="frigate-thumb-bbox" ${this._config.frigate_thumb_bbox ? "checked" : ""}><span class="cgc-track"></span></label>
            </div>
          </div>
        </div>
        <div class="row">
          <div class="row-head">
            <div>
              <div class="lbl">Cluster near-adjacent events</div>
              <div class="desc">Collapse multiple Frigate events for the same camera + label within a short time window into one representative thumb. Tap the count badge in the gallery to expand the cluster inline.</div>
            </div>
            <div class="togrow">
              <label class="cgc-switch"><input type="checkbox" id="frigate-event-cluster" ${this._config.frigate_event_cluster ? "checked" : ""}><span class="cgc-track"></span></label>
            </div>
          </div>
        </div>
        ${this._config.frigate_event_cluster ? `
        <div class="row">
          <div class="lbl">Cluster gap <span style="font-weight:400;color:var(--ed-text2);font-size:0.85em;">(seconds)</span></div>
          <div class="desc">Events less than this many seconds apart get merged. Start with 30 — increase if you still see duplicate bezorger / cleaner / dog-loose thumbs.</div>
          <div class="field">
            <input type="number" class="ed-input" id="frigate-event-cluster-gap-sec" min="1" max="600" step="1" value="${this._config.frigate_event_cluster_gap_sec ?? 30}" />
          </div>
        </div>
        ` : ""}
      `;

    const showFrigate = mediaModeOn || combinedModeOn;
    const hasFrigateUrl = !!this._config.frigate_url;

    return `
        <div class="tabpanel" data-panel="source">
          ${v2ExpandToggle}
          ${v2Collapsible("view",   "View",   true, viewBody,   "mdi:image-outline")}
          ${v2Collapsible("source", "Source", true, sourceBody, "mdi:database-outline")}
          ${showFrigate ? v2Collapsible("frigate", "Frigate", hasFrigateUrl, frigateBody, "mdi:link-variant") : ""}
        </div>
      `;
  }

  /** The Gallery tab. Part of _render(). */
  _renderGalleryTab({
    objectFit,
    previewPos,
    cleanMode,
    fullscreenZoom,
    c,
    chevronToggleRow,
    persistentControls,
    v2ExpandToggle,
    v2Collapsible,
  }) {
    const displayBody = `
        <div class="row">
          <div class="lbl">Image fit</div>
          <div class="desc"><code>Cover</code> fills the preview and may crop edges; <code>Contain</code> shows the whole frame with letterbox bars.</div>
          <div class="segwrap">
            <button class="seg ${objectFit === "cover" ? "on" : ""}" data-objfit="cover">Cover</button>
            <button class="seg ${objectFit === "contain" ? "on" : ""}" data-objfit="contain">Contain</button>
          </div>
        </div>

        <div class="row">
          <div class="lbl">Preview position</div>
          <div class="desc">Where the preview pane sits relative to the thumbnail strip.</div>
          <div class="segwrap">
            <button class="seg ${previewPos === "top" ? "on" : ""}" data-ppos="top">Top</button>
            <button class="seg ${previewPos === "bottom" ? "on" : ""}" data-ppos="bottom">Bottom</button>
          </div>
        </div>

        <div class="row">
          <div class="row-head">
            <div>
              <div class="lbl">Preview-only mode</div>
              <div class="desc">Only shows the preview window — toolbar, thumbnails and filters are hidden until the user taps back into the gallery.</div>
            </div>
            <div class="togrow">
              <label class="cgc-switch"><input type="checkbox" id="cleanmode" ${cleanMode ? "checked" : ""}><span class="cgc-track"></span></label>
            </div>
          </div>
        </div>

        <div class="row">
          <div class="row-head">
            <div>
              <div class="lbl">Fullscreen zoom</div>
              <div class="desc">Enable pinch-to-zoom, pan, double-tap and mouse wheel zoom in the fullscreen image viewer.</div>
            </div>
            <div class="togrow">
              <label class="cgc-switch"><input type="checkbox" id="fullscreenzoom" ${fullscreenZoom ? "checked" : ""}><span class="cgc-track"></span></label>
            </div>
          </div>
        </div>
      `;

    const playbackBody = `
        <div class="row">
          <div class="subrows">
            <div class="row-head">
              <div>
                <div class="lbl">Autoplay</div>
                <div class="desc">Start playing a clip as soon as it's opened in the preview.</div>
              </div>
              <div class="togrow">
                <label class="cgc-switch"><input type="checkbox" id="autoplay"><span class="cgc-track"></span></label>
              </div>
            </div>

            <div class="row-head">
              <div>
                <div class="lbl">Start muted</div>
                <div class="desc">Begin clips muted. Users can unmute via the player controls.</div>
              </div>
              <div class="togrow">
                <label class="cgc-switch"><input type="checkbox" id="auto_muted"><span class="cgc-track"></span></label>
              </div>
            </div>
          </div>
        </div>
        <div class="row">
          <div class="lbl">Clip fullscreen</div>
          <div class="desc"><code>Card</code> opens clips in the card's own fullscreen viewer, with the arrows and your place in the clip. <code>Video</code> hands the clip to the browser's or phone's own player (AirPlay, picture-in-picture, system gestures).</div>
          <div class="segwrap">
            <button class="seg ${c.gallery_fullscreen === "video" ? "" : "on"}" data-galleryfs="overlay">Card</button>
            <button class="seg ${c.gallery_fullscreen === "video" ? "on" : ""}" data-galleryfs="video">Video</button>
          </div>
        </div>
      `;


    // Pills — per-pill on/off + reorder via up/down arrows. Sparse
    // overrides only in `gallery_pills`: pills not mentioned use catalog
    // defaults (see `src/data/pill-catalog.ts`). The editor lists pills
    // in their current render order so the arrows match the visual
    // outcome.
    const cfgGalleryPills =
      c.gallery_pills && typeof c.gallery_pills === "object" ? c.gallery_pills : {};
    const hasPillOverrides = Object.keys(cfgGalleryPills).length > 0;
    const pillSettingsMap = resolvePillSettings(GALLERY_PILL_CATALOG, cfgGalleryPills);
    // Show pills in effective render order. Disabled pills stay in the
    // list (at their current order slot) so the user can re-enable
    // them with a single click — without them disappearing into an
    // "off" pool.
    const pillRowsOrdered = [...GALLERY_PILL_CATALOG]
      .map((entry) => ({ entry, s: pillSettingsMap.get(entry.id) }))
      .sort((a, b) => {
        // Disabled pills sink to the bottom so they're out of the way;
        // within each group sort by effective order, then catalog order.
        if (a.s.enabled !== b.s.enabled) return a.s.enabled ? -1 : 1;
        return (
          a.s.order - b.s.order ||
          GALLERY_PILL_CATALOG.indexOf(a.entry) - GALLERY_PILL_CATALOG.indexOf(b.entry)
        );
      });

    const pillsModeVal = c.controls_mode ?? "overlay";
    const pillsBarPosVal = c.bar_position ?? "top";
    const pillsAlignVal = c.gallery_pills_align || "center";
    const pillsAlignDisabled = pillsModeVal === "fixed" || pillsBarPosVal === "hidden";
    const pillsAlignDisabledReason =
      pillsBarPosVal === "hidden"
        ? " <em>No effect</em> — the pill row is hidden."
        : pillsModeVal === "fixed"
          ? " <em>Ignored in fixed mode</em> — pills always fill the bar."
          : "";
    const pillsBody = `
        ${chevronToggleRow(
        "gallerychevrons",
        "Left/right arrows over the preview to walk through the filtered clip list. Auto-hidden when there's only one clip.",
        c.gallery_chevrons_enabled !== false,
      )}
        <div class="row">
          <div class="lbl">Mode</div>
          <div class="desc"><code>Overlay</code> floats pills over the preview; <code>Fixed</code> reserves a strip and stretches them across.</div>
          <div class="segwrap" style="margin-top:6px;">
            <button class="seg ${pillsModeVal === "overlay" ? "on" : ""}" data-ctrlmode="overlay">Overlay</button>
            <button class="seg ${pillsModeVal === "fixed" ? "on" : ""}" data-ctrlmode="fixed">Fixed</button>
          </div>
        </div>
        <div class="row">
          <div class="lbl">Position</div>
          <div class="desc">Where the pill row sits relative to the preview. Pick <code>Hidden</code> to drop it entirely.</div>
          <div class="segwrap" style="margin-top:6px;">
            <button class="seg ${pillsBarPosVal === "top" ? "on" : ""}" data-pillsbarpos="top">Top</button>
            <button class="seg ${pillsBarPosVal === "bottom" ? "on" : ""}" data-pillsbarpos="bottom">Bottom</button>
            <button class="seg ${pillsBarPosVal === "hidden" ? "on" : ""}" data-pillsbarpos="hidden">Hidden</button>
          </div>
        </div>
        <div class="row ${pillsAlignDisabled ? "muted" : ""}">
          <div class="lbl">Alignment</div>
          <div class="desc">Where the row of pills sits within the bar.${pillsAlignDisabledReason}</div>
          <div class="segwrap" style="margin-top:6px;">
            <button class="seg ${pillsAlignVal === "left" ? "on" : ""}" data-pillsalign="left" ${pillsAlignDisabled ? "disabled" : ""}>Left</button>
            <button class="seg ${pillsAlignVal === "center" ? "on" : ""}" data-pillsalign="center" ${pillsAlignDisabled ? "disabled" : ""}>Center</button>
            <button class="seg ${pillsAlignVal === "right" ? "on" : ""}" data-pillsalign="right" ${pillsAlignDisabled ? "disabled" : ""}>Right</button>
          </div>
        </div>
        <div class="row ${c.controls_mode === "fixed" ? "muted" : ""}">
          <div class="row-head">
            <div>
              <div class="lbl">Persistent controls</div>
              <div class="desc">Keep the pill row on screen all the time instead of auto-hiding after a few seconds.${c.controls_mode === "fixed" ? " <em>Ignored in fixed mode</em> — the bar is always visible." : ""}</div>
            </div>
            <div class="togrow">
              <label class="cgc-switch"><input type="checkbox" id="persistentcontrols" ${persistentControls ? "checked" : ""} ${c.controls_mode === "fixed" ? "disabled" : ""}><span class="cgc-track"></span></label>
            </div>
          </div>
        </div>
        <div class="pills-dnd-list" id="pills-dnd-list">
          ${pillRowsOrdered
          .map((row) => {
            const entry = row.entry;
            const enabled = row.s.enabled;
            const idAttr = String(entry.id).replace(/"/g, "&quot;");
            const labelEsc = String(entry.label).replace(/</g, "&lt;");
            const previewMarkup = entry.previewText
              ? `<span class="pill-dnd-preview-text">${String(entry.previewText).replace(/</g, "&lt;")}</span>`
              : entry.icon
                ? `<ha-icon icon="${entry.icon}" style="--mdc-icon-size:18px;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;"></ha-icon>`
                : "";
            return `
                <div class="row pill-dnd-row ${enabled ? "" : "pill-dnd-disabled"}" data-pill-row="${idAttr}" draggable="true">
                  <div class="pill-dnd-line">
                    <span class="pill-drag-grip" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>
                    <span class="pill-dnd-icon" aria-hidden="true">${previewMarkup}</span>
                    <div class="lbl pill-dnd-label">${labelEsc}</div>
                    <label class="cgc-switch"><input type="checkbox" id="pill-enable-${idAttr}" ${enabled ? "checked" : ""}><span class="cgc-track"></span></label>
                  </div>
                </div>
              `;
          })
          .join("")}
        </div>
      `;

    // ── Long-press actions (`thumb_actions`, #243)
    const thumbActions = Array.isArray(this._config.thumb_actions) ? this._config.thumb_actions : [];
    const escTa = (v) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const taLabel = (txt) => `<div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">${txt}</div>`;
    const thumbActionsBody = `
        <div class="row">
          <div class="desc">Extra entries in the long-press (right-click) menu of a thumbnail. Each one calls a Home Assistant action with details of the pressed item, for example a script that archives the clip. In <b>Data</b> you can use <code>{path}</code>, <code>{media_id}</code>, <code>{url}</code> and <code>{filename}</code>; they are filled in per item.</div>
          ${thumbActions.length ? `
            <div class="menubtn-list">
              ${thumbActions.map((a, i) => `
                <div class="menubtn-card">
                  <div class="menubtn-card-header">
                    <span style="flex:1;font-size:0.82em;opacity:0.65;">${escTa(a?.name || "Action " + (i + 1))}</span>
                    <button type="button" class="livecam-tag-del" data-ta-del="${i}" title="Remove">×</button>
                  </div>
                  <div class="menubtn-fields">
                    <div>
                      ${taLabel("Name")}
                      <div class="field"><input type="text" class="ed-input" data-ta="${i}" data-ta-field="name" value="${escTa(a?.name)}" placeholder="Archive" autocomplete="off" /></div>
                    </div>
                    <div>
                      ${taLabel("Icon")}
                      <div class="field">
                        <input type="text" class="ed-input" data-ta="${i}" data-ta-field="icon" value="${escTa(a?.icon)}" placeholder="mdi:archive-arrow-down" autocomplete="off" />
                        <div class="suggestions" data-ta-icon-sugg="${i}" hidden></div>
                      </div>
                    </div>
                    <div style="grid-column:1/-1;">
                      ${taLabel("Action")}
                      <div class="field"><input type="text" class="ed-input" data-ta="${i}" data-ta-field="perform_action" value="${escTa(a?.perform_action)}" placeholder="script.archive_clip" autocomplete="off" spellcheck="false" /></div>
                    </div>
                    <div style="grid-column:1/-1;">
                      ${taLabel("Data (JSON)")}
                      <textarea class="ed-input" data-ta-data="${i}" rows="3" spellcheck="false" placeholder='{"path":"{path}"}' style="width:100%;box-sizing:border-box;resize:vertical;font-family:monospace;font-size:0.78em;">${escTa(a?.data && typeof a.data === "object" ? JSON.stringify(a.data, null, 2) : "")}</textarea>
                    </div>
                    <div style="grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px;">
                      <span style="font-size:0.82em;">Ask for confirmation</span>
                      <label class="cgc-switch"><input type="checkbox" data-ta-confirm="${i}" ${a?.confirmation ? "checked" : ""}><span class="cgc-track"></span></label>
                    </div>
                  </div>
                </div>
              `).join("")}
            </div>
          ` : ""}
          <div style="margin-top:8px;border:1px solid var(--ed-input-border);border-radius:var(--ed-radius-input,8px);padding:8px 10px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              <div>
                ${taLabel("Name")}
                <div class="field"><input type="text" class="ed-input" id="ta-add-name" placeholder="Archive" autocomplete="off" /></div>
              </div>
              <div>
                ${taLabel("Action")}
                <div class="field"><input type="text" class="ed-input" id="ta-add-action" placeholder="script.archive_clip" autocomplete="off" spellcheck="false" /></div>
              </div>
              <div style="grid-column:1/-1;display:flex;align-items:flex-end;">
                <button type="button" id="ta-add-btn" class="actionbtn" style="width:100%;justify-content:center;">+ Add action</button>
              </div>
            </div>
          </div>
        </div>
      `;

    return `
        <div class="tabpanel" data-panel="gallery">
          ${v2ExpandToggle}
          ${v2Collapsible("display",  "Display",  true,  displayBody,  "mdi:image-outline")}
          ${v2Collapsible("playback", "Playback", false, playbackBody, "mdi:play-circle-outline")}
          ${v2Collapsible("controls", "Controls", hasPillOverrides, pillsBody, "mdi:tune-vertical")}
          ${v2Collapsible("thumbactions", "Long-press actions", thumbActions.length > 0, thumbActionsBody, "mdi:dots-horizontal")}
        </div>
      `;
  }

  /** The Live tab. Part of _render(). */
  _renderLiveTab({
    liveEnabled,
    cameraEntities,
    liveCameraEntities,
    liveLayout,
    liveGridEmphasis,
    liveFullscreen,
    c,
    chevronToggleRow,
    v2Collapsible,
    liveGridCols,
  }) {
    // Auto-open helpers — collapsibles default open if the user has already
    // configured something inside them, so they don't have to hunt for it
    // after the v1 → v2 switch.
    // Use the canonical readers so unified-shape configs (#137) don't
    // close their collapsibles on first render. Legacy callers stay
    // covered via the same helpers' fallback paths.
    const liveCamsArr = Array.isArray(this._config.live_cameras) ? this._config.live_cameras : [];
    const hasStreamUrls =
      (Array.isArray(this._config.live_stream_urls) && this._config.live_stream_urls.length > 0) ||
      !!this._config.live_stream_url ||
      liveCamsArr.some((lc) => lc && typeof lc.url === "string" && lc.url.trim());
    const hasMic = hasAnyMicStream(this._config);
    const hasMenuButtons = Array.isArray(this._config.menu_buttons) && this._config.menu_buttons.length > 0;
    const hasPtz =
      !!this._config.live_ptz_enabled ||
      (this._config.live_ptz_cameras &&
        typeof this._config.live_ptz_cameras === "object" &&
        Object.keys(this._config.live_ptz_cameras).length > 0);

    // ── Basics: live picker, layout, default cam, auto-muted, camera-name.
    // The master "Enable live view" toggle has been promoted out of this
    // body — it now lives on the tab header next to the Expand-all
    // button so it stays visible no matter which collapsible is open.
    const basicsBody = `

        ${liveEnabled ? `
          ${cameraEntities.length > 1 ? `
          <div class="row">
            <div class="lbl">Cameras in picker</div>
            <div class="desc">Cameras in the live-view picker. Drag the <code>⠿</code> handle to reorder, tap a row to expand. Setting a <strong>mic stream</strong> for a camera enables the talk button on that camera's live view (toggle / push-to-talk mode + audio settings live under <strong>Two-way audio</strong> below). The first camera is selected by default unless you set another one below.</div>
            ${(() => {
            const se = Array.isArray(this._config.live_stream_urls) && this._config.live_stream_urls.length > 0
              ? this._config.live_stream_urls.filter(e => e?.url)
              : (this._config.live_stream_url ? [{ url: this._config.live_stream_url, name: this._config.live_stream_name || "Stream" }] : []);
            return se.length > 0 ? `
                <div class="livecam-tags">
                  ${se.map((e, i) => `<div class="livecam-tag"><span style="opacity:0.5;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;">stream ${se.length > 1 ? i+1 : ""}</span><span style="margin-left:4px;">${e.name || "Stream"}</span></div>`).join("")}
                </div>` : ``;
          })()}
            ${liveCameraEntities.length > 0 ? `
            <div class="livecam-rows" id="livecam-tags-dnd">
              ${liveCameraEntities.map((id) => {
              const name = (entityDisplayName(this._hass, id) || id);
              const mic = String(micStreamForCamera(id, this._config) || "");
              const isOpen = this._livecamRowOpen?.has(id) ? "open" : "";
              return `
                  <div class="livecam-row ${isOpen}" data-dragcam="${id}" draggable="true">
                    <div class="livecam-rowhead" data-livecam-toggle="${id}">
                      <span class="livecam-rowgrip">⠿</span>
                      <span class="livecam-rowname">${name}<span class="livecam-rowent">${id}</span></span>
                      <span class="livecam-rowmic ${mic ? "" : "none"}">${mic ? mic : "no mic"}</span>
                      <span class="livecam-chevron">›</span>
                    </div>
                    <div class="livecam-rowbody">
                      <div class="livecam-fieldrow">
                        <label>Mic stream</label>
                        <input type="text" class="ed-input livecam-mic-input" data-mic-cam="${id}" value="${mic.replace(/"/g, "&quot;")}" placeholder="go2rtc stream (empty = no mic)" autocomplete="off" />
                      </div>
                      <div class="livecam-fieldrow">
                        <label>Triggers</label>
                        <input type="text" class="ed-input livecam-trig-input" data-trig-cam="${id}" value="${(() => {
                        const entry = this._liveCameraEntry(id);
                        return (Array.isArray(entry?.triggers) ? entry.triggers : []).join(", ").replace(/"/g, "&quot;");
                      })()}" placeholder="binary_sensor.motion, event.doorbell" autocomplete="off" />
                      </div>
                      <div class="livecam-fieldrow">
                        <label>Rotation</label>
                        <div class="segwrap">
                          ${(() => {
                          const entry = this._liveCameraEntry(id);
                          const rot = normalizeRotation(entry?.rotation);
                          return [0, 90, 180, 270]
                            .map((r) => `<button type="button" class="seg ${rot === r ? "on" : ""}" data-rotcam="${id}" data-rot="${r}">${r}°</button>`)
                            .join("");
                        })()}
                        </div>
                      </div>
                      ${this._renderLivecamCropInline(id)}
                      <div class="livecam-actions">
                        <button type="button" class="livecam-row-del" data-delcam="${id}">${svgIcon('mdi:delete-outline', 14)}<span>Remove camera</span></button>
                      </div>
                    </div>
                  </div>
                `;
            }).join("")}
            </div>
            ` : ``}
            <div class="field" style="margin-top:6px;">
              <input type="text" class="ed-input" id="livecam-input" placeholder="Search cameras..." autocomplete="off" />
              <div class="suggestions" id="livecam-suggestions" hidden></div>
            </div>
          </div>
          ` : ``}

          ${liveCameraEntities.length > 1 ? `
          <div class="row">
            <div class="lbl">Live layout</div>
            <div class="desc"><code>Single</code> shows one camera at a time. <code>Grid</code> tiles all of them — tap a tile to focus.</div>
            <div class="segwrap">
              <button class="seg ${liveLayout === "single" ? "on" : ""}" data-livelayout="single">Single</button>
              <button class="seg ${liveLayout === "grid" ? "on" : ""}" data-livelayout="grid">Grid</button>
            </div>
            ${liveLayout === "grid" ? `
            <div class="lbl" style="margin-top:10px;">Grid columns</div>
            <div class="desc"><code>Auto</code> shapes the grid to the number of cameras and fills every cell. Pin a number to force a fixed column count.</div>
            <div class="segwrap">
              ${[0, 1, 2, 3, 4].map((n) => `
                <button class="seg ${liveGridCols === n ? "on" : ""}" data-gridcols="${n}">${n === 0 ? "Auto" : n}</button>
              `).join("")}
            </div>
            <div class="lbl" style="margin-top:10px;">Larger tiles</div>
            <div class="desc">Where the bigger tiles land when a row has fewer cameras than the rest. <code>Bottom</code> puts the short row last. <code>Top</code> puts it first. <code>Hero</code> gives camera 1 a full row to itself.</div>
            <div class="segwrap">
              <button class="seg ${liveGridEmphasis === "bottom" ? "on" : ""}" data-gridemphasis="bottom">Bottom</button>
              <button class="seg ${liveGridEmphasis === "top" ? "on" : ""}" data-gridemphasis="top">Top</button>
              <button class="seg ${liveGridEmphasis === "hero" ? "on" : ""}" data-gridemphasis="hero">Hero</button>
            </div>
            ` : ``}
          </div>
          ` : ``}

          <div class="row">
            <div class="lbl">Fullscreen</div>
            <div class="desc"><code>Card</code> keeps the pills, PTZ and zoom on screen. <code>Video</code> hands the stream to the browser's own player. Grid layout always uses <code>Card</code>.</div>
            <div class="segwrap">
              <button class="seg ${liveFullscreen === "card" ? "on" : ""}" data-livefs="card">Card</button>
              <button class="seg ${liveFullscreen === "video" ? "on" : ""}" data-livefs="video">Video</button>
            </div>
          </div>

          <div class="row">
            <div class="row-head">
              <div>
                <div class="lbl">Start muted</div>
                <div class="desc">Begin live streams muted on tab switch. Users can unmute per camera.</div>
              </div>
              <div class="togrow">
                <label class="cgc-switch"><input type="checkbox" id="live_auto_muted"><span class="cgc-track"></span></label>
              </div>
            </div>
            <div class="row-head">
              <div>
                <div class="lbl">Show camera name</div>
                <div class="desc">Show the camera's name on the live preview — as a pill in single view, and as a label on each tile in grid view.</div>
              </div>
              <div class="togrow">
                <label class="cgc-switch"><input type="checkbox" id="showcameratitle" ${c.show_camera_title !== false && c.live_grid_labels !== false ? "checked" : ""}><span class="cgc-track"></span></label>
              </div>
            </div>
          </div>
        ` : ``}
      `;

    // ── Streams collapsible
    const streamsBody = `
        <div class="row">
          <div class="desc">Add RTSP / HLS / RTMP stream URLs as extra entries in the picker. Useful for cameras that don't have a Home Assistant entity.</div>
          <div id="stream-urls-list">
            ${(() => {
            const entries = (() => {
              if (Array.isArray(this._config.live_stream_urls) && this._config.live_stream_urls.length > 0)
                return this._config.live_stream_urls;
              if (this._config.live_stream_url)
                return [{ url: this._config.live_stream_url, name: this._config.live_stream_name || "" }];
              return [];
            })();
            return entries.map((e, i) => `
                <div class="stream-url-row" data-si="${i}" style="display:flex;flex-direction:column;gap:4px;padding:8px 0 8px 0;border-bottom:1px solid var(--divider-color,#e0e0e0);">
                  <div style="display:flex;gap:6px;align-items:center;">
                    <input type="text" class="ed-input stream-url-input" data-si="${i}" placeholder="rtsp://192.168.1.x:554/stream" autocomplete="off" value="${(e.url || "").replace(/"/g, "&quot;")}" style="flex:1;" />
                    <button type="button" class="livecam-tag-del stream-url-del" data-si="${i}" style="flex-shrink:0;">×</button>
                  </div>
                  <input type="text" class="ed-input stream-name-input" data-si="${i}" placeholder="Name (e.g. Front door)" autocomplete="off" value="${(e.name || "").replace(/"/g, "&quot;")}" />
                </div>
              `).join("");
          })()}
          </div>
          <button type="button" id="stream-url-add" class="cgc-ed-btn" style="margin-top:8px;">+ Add stream URL</button>
        </div>
      `;

    // ── Two-way audio collapsible
    const lt = this._config.live_triggers || {};
    const hasTriggers =
      !!this._config.live_triggers ||
      (Array.isArray(this._config.live_cameras) &&
        this._config.live_cameras.some((lc) => Array.isArray(lc?.triggers) && lc.triggers.length > 0));
    const ltReturn = lt.return_to || "previous";
    const triggersBody = `
        <div class="row">
          <div class="desc">Switch to a camera's live view when something happens there, then go back. Pick the entities per camera under <strong>Basics → Cameras in picker</strong>: expand a camera and fill in <em>Triggers</em> (motion or occupancy sensors, a doorbell <code>event</code>, any entity that turns <code>on</code>). Only works while the dashboard is open; the card cannot wake a sleeping screen.</div>
        </div>
        <div class="row">
          <div class="row-head">
            <div>
              <div class="lbl">Frigate events</div>
              <div class="desc">A new Frigate event switches to <code>camera.&lt;frigate camera name&gt;</code>, when that camera is in the live list.</div>
            </div>
            <div class="togrow">
              <label class="cgc-switch"><input type="checkbox" id="live-trig-frigate" ${lt.frigate ? "checked" : ""}><span class="cgc-track"></span></label>
            </div>
          </div>
          ${lt.frigate ? `
          <div class="field" style="margin-top:8px;">
            <input type="text" class="ed-input" id="live-trig-frigate-labels" placeholder="Only these labels, e.g. person, car (empty = all)" autocomplete="off" value="${(Array.isArray(lt.frigate_labels) ? lt.frigate_labels : []).join(", ").replace(/"/g, "&quot;")}" />
          </div>` : ""}
        </div>
        <div class="row">
          <div class="lbl">Stay on the camera (seconds)</div>
          <div class="desc">How long after the last trigger the card goes back. A tap on the card in the meantime keeps it where it is.</div>
          <div class="field">
            <input type="number" class="ed-input" id="live-trig-hold" min="5" max="3600" step="1" value="${lt.hold_seconds ?? 30}" />
          </div>
        </div>
        <div class="row">
          <div class="lbl">Cooldown per camera (seconds)</div>
          <div class="desc">Ignore repeat triggers for the same camera within this time.</div>
          <div class="field">
            <input type="number" class="ed-input" id="live-trig-cooldown" min="0" max="3600" step="1" value="${lt.cooldown_seconds ?? 10}" />
          </div>
        </div>
        <div class="row">
          <div class="lbl">Afterwards</div>
          <div class="desc"><code>Previous</code> returns to the view it came from. <code>Gallery</code> always goes to the gallery. <code>Stay</code> keeps showing the camera.</div>
          <div class="segwrap">
            <button class="seg ${ltReturn === "previous" ? "on" : ""}" data-livetrigreturn="previous">Previous</button>
            <button class="seg ${ltReturn === "gallery" ? "on" : ""}" data-livetrigreturn="gallery">Gallery</button>
            <button class="seg ${ltReturn === "stay" ? "on" : ""}" data-livetrigreturn="stay">Stay</button>
          </div>
        </div>
      `;
    const twoWayBody = `
        <div class="row">
          <div class="desc">Global settings for talkback. Per-camera mic streams are configured in the <strong>Cameras</strong> section above — expand a camera and fill in its <em>Mic stream</em> (the go2rtc stream name under <code>streams:</code> in <code>go2rtc.yaml</code>) to enable the talk button on that camera.</div>
          <div class="desc" style="margin-top:4px;font-size:0.78em;opacity:0.7;">Needs: <a href="https://github.com/AlexxIT/WebRTC" target="_blank" rel="noopener">WebRTC Camera</a> HACS integration · camera with audio backchannel · HTTPS or localhost.</div>
          ${(() => {
          const comps = this._hass?.config?.components;
          const hasWebrtc = Array.isArray(comps) && comps.includes("webrtc");
          if (hasWebrtc || !hasAnyMicStream(this._config)) return ``;
          return `<div class="cgc-inline-warn">${svgIcon('mdi:alert-outline', 14)}<span>WebRTC Camera integration not detected — install it via HACS for the mic to work.</span></div>`;
        })()}
          ${(() => {
          const legacy = String(this._config.live_go2rtc_stream ?? "").trim();
          if (!legacy) return ``;
          return `<div class="desc" style="margin-top:8px;">
              <strong>Legacy single-stream config detected:</strong> <code>live_go2rtc_stream: ${legacy.replace(/</g,"&lt;")}</code> is set in your YAML. It still works (applies to whichever camera is active) and you don't need to change anything. Setting a per-camera mic stream in the Cameras section above switches to the per-camera map — once you do, the legacy key is ignored.
            </div>`;
        })()}
        </div>
        <div class="row">
          <div class="row-head">
            <div>
              <div class="lbl">Home Assistant two-way audio</div>
              <div class="desc">Use Home Assistant's own talk support for cameras without a mic stream above. Needs Home Assistant 2026.11 with <strong>Settings → System → Labs → Two-way audio</strong> on, a camera whose integration supports it (for example Reolink over RTSP, or Matter) and HTTPS. The talk button only appears on cameras that support it.</div>
            </div>
            <div class="togrow">
              <label class="cgc-switch"><input type="checkbox" id="live-native-talk" ${this._config.live_native_talk !== false ? "checked" : ""}><span class="cgc-track"></span></label>
            </div>
          </div>
        </div>
        ${hasAnyMicStream(this._config) || this._config.live_native_talk !== false ? `
        <div class="row">
          <div class="lbl">Interaction</div>
          <div class="desc"><code>Toggle</code> latches the mic on/off with one tap. <code>Push-to-talk</code> holds the mic open only while pressed.</div>
          <div class="segwrap">
            <button class="seg ${(this._config.live_mic_mode || "toggle") === "toggle" ? "on" : ""}" data-livemicmode="toggle">Toggle</button>
            <button class="seg ${this._config.live_mic_mode === "ptt" ? "on" : ""}" data-livemicmode="ptt">Push-to-talk</button>
          </div>
        </div>
        <div class="row">
          ${(() => {
          const shape = this._config.live_mic_shape === "button" ? "button" : "bar";
          const pos = this._config.live_mic_button_position || "center";
          const segShape = (val, label) =>
            `<button class="seg ${shape === val ? "on" : ""}" data-livemicshape="${val}">${label}</button>`;
          const segPos = (val, label) =>
            `<button class="seg ${pos === val ? "on" : ""}" data-livemicbtnpos="${val}">${label}</button>`;
          return `
            <div class="lbl">Shape</div>
            <div class="desc"><code>Bar</code> spans the full preview width. <code>Button</code> shows a compact round mic button.</div>
            <div class="segwrap">
              ${segShape("bar",    "Bar")}
              ${segShape("button", "Button")}
            </div>
            ${shape === "button" ? `
            <div style="margin-top:14px;">
              <div class="lbl" style="margin-bottom:8px;">Button position</div>
              <div class="segwrap">
                ${segPos("left",   "Left")}
                ${segPos("center", "Center")}
                ${segPos("right",  "Right")}
              </div>
            </div>
            ` : ``}`;
        })()}
        </div>
        <div class="row">
          ${(() => {
          const mp = this._config.live_mic_position || "overlay";
          const seg = (val, label) =>
            `<button class="seg ${mp === val ? "on" : ""}" data-livemicpos="${val}">${label}</button>`;
          return `
            <div class="lbl">Position</div>
            <div class="desc"><code>Over video</code> floats the talk control on the live picture. <code>Below</code> and <code>Above</code> give it its own row, so it never covers the camera view.</div>
            <div class="segwrap">
              ${seg("overlay", "Over video")}
              ${seg("below",   "Below")}
              ${seg("above",   "Above")}
            </div>`;
        })()}
        </div>
        <div class="row">
          <div class="lbl">Audio processing</div>
          <div class="desc">Browser-level mic processing applied before the audio reaches your camera.</div>
          ${(() => {
          const ap = this._config.live_mic_audio_processing || {};
          const ec = ap.echo_cancellation !== false;
          const ns = ap.noise_suppression !== false;
          const agc = ap.auto_gain_control !== false;
          return `
            <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px;">
              <div class="row-inline"><span>Echo cancellation</span><label class="cgc-switch"><input type="checkbox" id="live-mic-ec" ${ec ? "checked" : ""}><span class="cgc-track"></span></label></div>
              <div class="row-inline"><span>Noise suppression</span><label class="cgc-switch"><input type="checkbox" id="live-mic-ns" ${ns ? "checked" : ""}><span class="cgc-track"></span></label></div>
              <div class="row-inline"><span>Auto gain control</span><label class="cgc-switch"><input type="checkbox" id="live-mic-agc" ${agc ? "checked" : ""}><span class="cgc-track"></span></label></div>
            </div>`;
        })()}
        </div>
        <div class="row">
          ${(() => {
          const enabled = this._config.live_mic_waveform_enabled !== false;
          const sens = this._config.live_mic_waveform_sensitivity || "medium";
          const seg = (val, label) =>
            `<button class="seg ${sens === val ? "on" : ""}" data-wfsens="${val}">${label}</button>`;
          return `
            <div class="lbl">Waveform visualizer</div>
            <div class="desc">Frequency-bars overlay on the talkback bar while the mic is live.</div>
            <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px;">
              <div class="row-inline">
                <span>Enabled</span>
                <label class="cgc-switch"><input type="checkbox" id="live-mic-wf-enabled" ${enabled ? "checked" : ""}><span class="cgc-track"></span></label>
              </div>
              ${enabled ? `
              <div style="display:flex;flex-direction:column;gap:6px;">
                <span>Sensitivity</span>
                <div class="segwrap">
                  ${seg("low",    "Low")}
                  ${seg("medium", "Medium")}
                  ${seg("high",   "High")}
                </div>
              </div>
              ` : ``}
            </div>`;
        })()}
        </div>
        ` : ``}
      `;

    // ── Menu buttons collapsible
    const menuButtonsBody = `
        <div class="row">
          <div class="desc">Custom buttons in the live view — handy for toggling lights, sirens or running scripts without leaving the camera. Buttons sit in the hamburger menu, or directly among the live controls when "Show among live controls" is on. A button on an <code>input_select</code> or <code>select</code> entity opens a list of its options.</div>
          ${(() => {
          const menuButtons = Array.isArray(this._config.menu_buttons) ? this._config.menu_buttons : [];
          return menuButtons.length ? `
              <div class="menubtn-list">
                ${menuButtons.map((btn, i) => `
                  <div class="menubtn-card">
                    <div class="menubtn-card-header">
                      <span style="flex:1;font-size:0.82em;opacity:0.65;">${(btn.title || btn.entity || "Button " + (i + 1)).replace(/</g,"&lt;")}</span>
                      <button type="button" class="livecam-tag-del" data-delmenubutton="${i}">×</button>
                    </div>
                    <div class="menubtn-fields">
                      <div style="grid-column:1/-1;">
                        <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">Entity</div>
                        <div class="field">
                          <input type="text" class="ed-input" data-menubtn-entity="${i}" placeholder="entity_id" value="${(btn.entity||"").replace(/"/g,"&quot;")}" autocomplete="off" />
                          <div class="suggestions" data-menubtn-entity-sugg="${i}" hidden></div>
                        </div>
                      </div>
                      <div>
                        <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">Icon (off)</div>
                        <div class="field has-icon-preview">
                          <ha-icon class="icon-preview" icon="${(btn.icon||"").replace(/"/g,"&quot;")}"></ha-icon>
                          <input type="text" class="ed-input" data-menubtn="${i}" data-mbfield="icon" value="${(btn.icon||"").replace(/"/g,"&quot;")}" placeholder="mdi:lightbulb" autocomplete="off" />
                          <div class="suggestions" data-menubtn-icon-sugg="${i}" hidden></div>
                        </div>
                      </div>
                      <div>
                        <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">Icon (on)</div>
                        <div class="field has-icon-preview">
                          <ha-icon class="icon-preview" icon="${(btn.icon_on||"").replace(/"/g,"&quot;")}"></ha-icon>
                          <input type="text" class="ed-input" data-menubtn="${i}" data-mbfield="icon_on" value="${(btn.icon_on||"").replace(/"/g,"&quot;")}" placeholder="mdi:lightbulb" autocomplete="off" />
                          <div class="suggestions" data-menubtn-iconon-sugg="${i}" hidden></div>
                        </div>
                      </div>
                      <div>
                        <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">Label</div>
                        <div class="field"><input type="text" class="ed-input" data-menubtn="${i}" data-mbfield="title" value="${(btn.title||"").replace(/"/g,"&quot;")}" placeholder="optional" /></div>
                      </div>
                      <div>
                        <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">Service</div>
                        <div class="field"><input type="text" class="ed-input" data-menubtn="${i}" data-mbfield="service" value="${(btn.service||"").replace(/"/g,"&quot;")}" placeholder="e.g. light.toggle" /></div>
                      </div>
                      <div>
                        <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">State (on)</div>
                        <div class="field"><input type="text" class="ed-input" data-menubtn="${i}" data-mbfield="state_on" value="${(btn.state_on||"").replace(/"/g,"&quot;")}" placeholder="e.g. open" /></div>
                      </div>
                    </div>
                  </div>
                `).join("")}
              </div>
            ` : "";
        })()}
          <div style="margin-top:8px;border:1px solid var(--ed-input-border);border-radius:var(--ed-radius-input,8px);padding:8px 10px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              <div style="grid-column:1/-1;">
                <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">Entity</div>
                <div class="field">
                  <input type="text" class="ed-input" id="menubtn-entity-input" placeholder="Search entity..." autocomplete="off" />
                  <div class="suggestions" id="menubtn-entity-sugg" hidden></div>
                </div>
              </div>
              <div>
                <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">Icon (off)</div>
                <div class="field has-icon-preview">
                  <ha-icon class="icon-preview" icon=""></ha-icon>
                  <input type="text" class="ed-input" id="menubtn-icon-input" placeholder="mdi:lightbulb" autocomplete="off" />
                  <div class="suggestions" id="menubtn-icon-sugg" hidden></div>
                </div>
              </div>
              <div style="display:flex;align-items:flex-end;">
                <button type="button" id="menubtn-add-btn" class="actionbtn" style="width:100%;justify-content:center;">+ Add</button>
              </div>
            </div>
          </div>
        </div>
      `;

    // ── PTZ: global toggle + position + per-camera enable/type cards.
    // Body mirrors the v1 layout — same IDs/classes so the existing
    // event wiring (live_ptz_enabled / live_ptz_position / .ptz-cam-*)
    // applies without duplication.
    const ptzBody = `
        <div class="row-inline" style="margin-top:6px;">
          <span>Enable PTZ overlay</span>
          <label class="cgc-switch"><input type="checkbox" id="live_ptz_enabled" ${this._config.live_ptz_enabled ? "checked" : ""}><span class="cgc-track"></span></label>
        </div>
        <div class="desc" style="margin-top:6px;">Virtual joystick + zoom controls. Integration type is auto-detected per camera.</div>
        ${this._config.live_ptz_enabled ? `
        <div style="margin-top:10px;">
          <div style="font-size:0.78em;opacity:0.75;margin-bottom:6px;">Position</div>
          ${(() => {
          const overlay = (this._config.controls_mode || "overlay") === "overlay";
          const bp = String(this._config.bar_position || "top");
          const blockedHalf = !overlay ? null : bp === "top" ? "top" : bp === "bottom" ? "bottom" : null;
          const all = [
            { val: "top-left", label: "Top-left" },
            { val: "top-right", label: "Top-right" },
            { val: "bottom-left", label: "Bottom-left" },
            { val: "bottom-right", label: "Bottom-right" },
          ];
          const current = this._config.live_ptz_position || "bottom-left";
          return `<select class="ed-input" id="live_ptz_position" style="width:100%;box-sizing:border-box;height:36px;min-height:36px;flex:none;">
              ${all.map((o) => {
              const disabled = !!(blockedHalf && o.val.startsWith(blockedHalf));
              return `<option value="${o.val}" ${disabled ? "disabled" : ""} ${o.val === current ? "selected" : ""}>${o.label}${disabled ? " (blocked by pill bar)" : ""}</option>`;
            }).join("")}
            </select>`;
        })()}
        </div>

        ${(() => {
        const ptzMap = (this._config.live_ptz_cameras && typeof this._config.live_ptz_cameras === "object")
          ? this._config.live_ptz_cameras
          : {};
        if (liveCameraEntities.length === 0) {
          return `<div class="desc" style="margin-top:10px;font-style:italic;opacity:0.7;">Add at least one camera entity in Basics to configure PTZ.</div>`;
        }
        const hassForDetect = this._hass
          ? { states: this._hass.states, services: this._hass.services }
          : null;
        const ptzCapable = liveCameraEntities.filter((entId) =>
          ptzMap[entId] || (hassForDetect && detectPtzType(entId, hassForDetect))
        );
        const visibleCams = this._ptzShowAll ? liveCameraEntities : ptzCapable;
        const showAllToggle = `
            <div style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:0.78em;opacity:0.75;">
              <label class="cgc-switch" style="transform:scale(0.85);transform-origin:left center;"><input type="checkbox" id="ptz-show-all" ${this._ptzShowAll ? "checked" : ""}><span class="cgc-track"></span></label>
              <span>Show all cameras (manual selection for ONVIF / non-detected setups)</span>
            </div>
          `;
        // Autocomplete pools for the manual per-button pickers: only the
        // PTZ-relevant entities, so reboot/SD/siren buttons don't clutter.
        const ptzAllEntities = this._hass?.states ? Object.keys(this._hass.states) : [];
        const ptzButtonOpts = ptzAllEntities.filter((e) => /^button\..*_ptz_/.test(e)).sort();
        const ptzSelectOpts = ptzAllEntities.filter((e) => /^select\..*_ptz_preset$/.test(e)).sort();
        const ptzDatalists =
          `<datalist id="ptz-button-list">${ptzButtonOpts.map((o) => `<option value="${o.replace(/"/g, "&quot;")}"></option>`).join("")}</datalist>` +
          `<datalist id="ptz-select-list">${ptzSelectOpts.map((o) => `<option value="${o.replace(/"/g, "&quot;")}"></option>`).join("")}</datalist>`;
        if (visibleCams.length === 0) {
          return `<div class="desc" style="margin-top:10px;font-style:italic;opacity:0.7;">No PTZ-capable cameras detected. Add a camera that exposes PTZ button entities (EZVIZ, Reolink) or that supports frigate.ptz, and it'll show up here. Or flip the toggle below to pick a type manually.</div>${showAllToggle}`;
        }
        return ptzDatalists + `<div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">
            ${visibleCams.map((entId) => {
            const friendly = (entityDisplayName(this._hass, entId) || entId);
            const cfgEntry = ptzMap[entId];
            const enabled = !!cfgEntry;
            return `
                <div style="border:1px solid var(--ed-input-border);border-radius:var(--ed-radius-input,8px);padding:8px 10px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <div style="min-width:0;flex:1;">
                      <div style="font-weight:500;">${friendly.replace(/</g,"&lt;")}</div>
                      <div style="font-size:0.72em;opacity:0.6;">${entId.replace(/</g,"&lt;")}</div>
                    </div>
                    <label class="cgc-switch"><input type="checkbox" class="ptz-cam-enable" data-ptz-cam="${entId.replace(/"/g,"&quot;")}" ${enabled ? "checked" : ""}><span class="cgc-track"></span></label>
                  </div>
                  ${enabled ? `
                  <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">
                    <select class="ed-input ptz-cam-type" data-ptz-cam="${entId.replace(/"/g,"&quot;")}" style="width:100%;box-sizing:border-box;height:36px;min-height:36px;flex:none;">
                      <option value="ezviz" ${(cfgEntry.type || "ezviz") === "ezviz" ? "selected" : ""}>EZVIZ — pulse</option>
                      <option value="reolink" ${cfgEntry.type === "reolink" ? "selected" : ""}>Reolink — continuous</option>
                      <option value="frigate" ${cfgEntry.type === "frigate" ? "selected" : ""}>Frigate — continuous</option>
                      <option value="onvif" ${cfgEntry.type === "onvif" ? "selected" : ""}>ONVIF — continuous</option>
                      <option value="service" ${cfgEntry.type === "service" ? "selected" : ""}>Manual service</option>
                    </select>
                    ${((cfgEntry.type || "ezviz") === "ezviz" || cfgEntry.type === "reolink") ? `
                    <button type="button" class="actionbtn ptz-detect-btn" data-ptz-cam="${entId.replace(/"/g,"&quot;")}" style="align-self:flex-start;margin-top:2px;">Detect buttons</button>
                    ${[["up","Up","mdi:arrow-up"],["down","Down","mdi:arrow-down"],["left","Left","mdi:arrow-left"],["right","Right","mdi:arrow-right"],["zoom_in","Zoom in","mdi:magnify-plus-outline"],["zoom_out","Zoom out","mdi:magnify-minus-outline"],["stop","Stop","mdi:stop"],["home","Home","mdi:home-outline"]].map(([bk,blbl,bicon]) => {
                    const bval = (cfgEntry.buttons && typeof cfgEntry.buttons === "object" && typeof cfgEntry.buttons[bk] === "string") ? cfgEntry.buttons[bk] : "";
                    const blist = bk === "home" ? "ptz-select-list" : "ptz-button-list";
                    return `<div style="display:flex;align-items:center;gap:8px;" title="${blbl}">
                        <ha-icon icon="${bicon}" aria-label="${blbl}" style="--mdc-icon-size:18px;width:18px;height:18px;flex:none;opacity:0.7;"></ha-icon>
                        <input type="text" class="ed-input ptz-cam-button" data-ptz-cam="${entId.replace(/"/g,"&quot;")}" data-ptz-key="${bk}" list="${blist}" value="${bval.replace(/"/g,"&quot;")}" placeholder="auto" autocomplete="off" spellcheck="false" style="flex:1;min-width:0;font-size:0.82em;" />
                      </div>`;
                  }).join("")}
                    <div class="desc" style="margin-top:2px;">Leave blank to auto-detect. Pick from the list — only PTZ buttons are suggested (Home picks a <code>select…_ptz_preset</code>).</div>
                    ` : cfgEntry.type === "service" ? (() => {
                    const escapeText = (value) => String(value ?? "")
                      .replace(/&/g, "&amp;")
                      .replace(/</g, "&lt;")
                      .replace(/>/g, "&gt;");
                    const escapeAttr = (value) => escapeText(value).replace(/"/g, "&quot;");
                    const serviceData = [
                      ["start_left", "Start left"], ["end_left", "End left"],
                      ["start_right", "Start right"], ["end_right", "End right"],
                      ["start_up", "Start up"], ["end_up", "End up"],
                      ["start_down", "Start down"], ["end_down", "End down"],
                      ["zoom_in", "Zoom in (optional)"], ["zoom_out", "Zoom out (optional)"],
                      ["home", "Home (optional)"],
                    ];
                    return `
                        <div>
                          <div style="font-size:0.75em;opacity:0.65;margin-bottom:2px;">Home Assistant service</div>
                          <input type="text" class="ed-input ptz-cam-service" data-ptz-cam="${entId.replace(/"/g,"&quot;")}" value="${escapeAttr(cfgEntry.service)}" placeholder="script.camera_ptz" autocomplete="off" spellcheck="false" style="width:100%;box-sizing:border-box;" />
                        </div>
                        ${serviceData.map(([key, label]) => {
                        const value = cfgEntry[`data_${key}`];
                        const json = value && typeof value === "object" ? JSON.stringify(value, null, 2) : "";
                        return `<div>
                            <div style="font-size:0.75em;opacity:0.65;margin-bottom:2px;">${label} service data (JSON)</div>
                            <textarea class="ed-input ptz-cam-service-data" data-ptz-cam="${entId.replace(/"/g,"&quot;")}" data-ptz-key="data_${key}" placeholder='{"direction":"${key}"}' spellcheck="false" rows="2" style="width:100%;box-sizing:border-box;resize:vertical;font-family:monospace;font-size:0.78em;">${escapeText(json)}</textarea>
                          </div>`;
                      }).join("")}
                        <div class="desc" style="margin-top:2px;">For continuous cameras, use the same <code>data_start_*</code> + <code>data_end_*</code> shape as <code>custom:webrtc-camera</code>. The end command runs when the joystick is released. Legacy one-shot <code>data_left</code>/<code>data_right</code>/<code>data_up</code>/<code>data_down</code> YAML remains supported.</div>
                      `;
                  })() : `<div class="desc" style="margin-top:2px;">Service-based type — no buttons needed.</div>`}
                  </div>
                  ` : ""}
                </div>
              `;
          }).join("")}
          </div>${showAllToggle}`;
      })()}
        ` : ``}
      `;

    // Live-tab header row: master "Enable live view" toggle on the
    // left + the standard Expand-all link on the right. Keeps the
    // master switch visible regardless of which collapsible the user
    // has open.
    const liveTabHeader = `
        <div class="v2-tab-header">
          <div class="v2-tab-header-toggle">
            <span class="v2-tab-header-label">Enable live view</span>
            <label class="cgc-switch"><input type="checkbox" id="liveenabled" ${liveEnabled ? "checked" : ""}><span class="cgc-track"></span></label>
          </div>
          <button type="button" class="v2-expand-all" data-v2-expand>Expand all</button>
        </div>
      `;

    // If live preview is disabled, hide all collapsibles — the master
    // toggle in the header is enough to re-enable them. No body to
    // render below the header in that state.
    if (!liveEnabled) {
      return `
          <div class="tabpanel" data-panel="live">
            ${liveTabHeader}
          </div>
        `;
    }

    // Live-pill controls: per-pill on/off + reorder. Same sparse-overrides
    // model as gallery_pills (catalog defaults live in LIVE_PILL_CATALOG).
    const cfgLivePills =
      this._config.live_pills && typeof this._config.live_pills === "object"
        ? this._config.live_pills : {};
    const hasLivePillOverrides = Object.keys(cfgLivePills).length > 0;
    const liveControlsBody = `
        ${chevronToggleRow(
        "livechevrons",
        "Left/right arrows over the live view to flip between cameras. Auto-hidden if only one camera is configured.",
        c.live_chevrons_enabled !== false,
      )}
        <div class="row">
          <div class="row-head">
            <div>
              <div class="lbl">Recover frozen streams</div>
              <div class="desc">When the live picture stops moving for a few seconds, rebuild the stream automatically (up to 3 tries, then a "Try again" notice). Paused while the tab is hidden, in Picture-in-Picture, in native video fullscreen or during talkback.</div>
            </div>
            <div class="togrow">
              <label class="cgc-switch"><input type="checkbox" id="liveautorecover" ${c.live_auto_recover !== false ? "checked" : ""}><span class="cgc-track"></span></label>
            </div>
          </div>
        </div>
        <div class="row">
          <div class="desc">Drag <code>⠿</code> a control to where you want it: <strong>Row 1</strong> sits next to the camera name, <strong>Row 2</strong> is a second row below it, <strong>Menu</strong> is behind the ☰ button. The order in a box is the order on screen. Switch a built-in control off to hide it. Built-in controls can't go in the menu.</div>
        </div>
        <div class="ctl-zones" id="live-ctl-zones">
          ${(() => {
          const btns = Array.isArray(this._config.menu_buttons) ? this._config.menu_buttons : [];
          const zones = liveControlZones(this._config.live_pills, btns);
          const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
          const itemHtml = (item) => {
            const key = esc(itemKey(item));
            if (item.kind === "pill") {
              const entry = LIVE_PILL_CATALOG.find((e) => e.id === item.id);
              if (!entry) return "";
              const preview = entry.previewText
                ? `<span class="pill-dnd-preview-text">${esc(entry.previewText)}</span>`
                : entry.icon ? `<ha-icon icon="${entry.icon}" style="--mdc-icon-size:18px;width:18px;height:18px;display:inline-flex;"></ha-icon>` : "";
              return `
                  <div class="row pill-dnd-row ${item.enabled ? "" : "pill-dnd-disabled"}" data-ctl-key="${key}" draggable="true">
                    <div class="pill-dnd-line">
                      <span class="pill-drag-grip" title="Drag to move" aria-label="Drag to move">⠿</span>
                      <span class="pill-dnd-icon" aria-hidden="true">${preview}</span>
                      <div class="lbl pill-dnd-label">${esc(entry.label)}</div>
                      <label class="cgc-switch"><input type="checkbox" id="live-pill-enable-${esc(entry.id)}" ${item.enabled ? "checked" : ""}><span class="cgc-track"></span></label>
                    </div>
                  </div>`;
            }
            const btn = btns[item.index];
            if (!btn) return "";
            const label = btn.title || (btn.entity ? entityDisplayName(this._hass, btn.entity) || btn.entity : "Shortcut");
            return `
                <div class="row pill-dnd-row" data-ctl-key="${key}" draggable="true">
                  <div class="pill-dnd-line">
                    <span class="pill-drag-grip" title="Drag to move" aria-label="Drag to move">⠿</span>
                    <span class="pill-dnd-icon" aria-hidden="true"><ha-icon icon="${esc(btn.icon)}" style="--mdc-icon-size:18px;width:18px;height:18px;display:inline-flex;"></ha-icon></span>
                    <div class="lbl pill-dnd-label">${esc(label)}</div>
                  </div>
                </div>`;
          };
          const zone = (key, title, hint, items) => `
              <div class="ctl-zone" data-ctl-zone="${key}">
                <div class="ctl-zone-head"><span>${title}</span><span>${hint}</span></div>
                ${items.length ? items.map(itemHtml).join("") : `<div class="ctl-zone-empty">Drag a control here</div>`}
              </div>`;
          return zone("row1", "Row 1", "next to the camera name", zones.row1)
            + zone("row2", "Row 2", "below the first row", zones.row2)
            + zone("menu", "Menu ☰", "behind the menu button", zones.menu);
        })()}
        </div>
      `;

    return `
        <div class="tabpanel" data-panel="live">
          ${liveTabHeader}
          ${v2Collapsible("basics",   "Basics",        true,                 basicsBody,        "mdi:tune")}
          ${v2Collapsible("streams",  "Streams",       hasStreamUrls,        streamsBody,       "mdi:link-variant")}
          ${v2Collapsible("triggers", "Triggers",      hasTriggers,          triggersBody,      "mdi:doorbell-video")}
          ${v2Collapsible("twoway",   "Two-way audio", hasMic,               twoWayBody,        "mdi:microphone-outline")}
          ${v2Collapsible("ptz",      "PTZ",           hasPtz,               ptzBody,           "mdi:arrow-all")}
          ${v2Collapsible("menu",     "Menu buttons",  hasMenuButtons,       menuButtonsBody,   "mdi:dots-horizontal")}
          ${v2Collapsible("controls", "Controls",     hasLivePillOverrides, liveControlsBody,  "mdi:tune-vertical")}
        </div>
      `;
  }

  /** The Thumbnails tab. Part of _render(). */
  _renderThumbsTab({
    c,
    cleanMode,
    selectedCount,
    objectFiltersArr,
    thumbLayout,
    thumbSizeMuted,
    thumbBarPos,
    thumbSortOrder,
    thumbFramePct,
    v2ExpandToggle,
    v2Collapsible,
    objectColors,
  }) {
    const hasFilters = Array.isArray(c.object_filters) && c.object_filters.length > 0;
    // In preview-only mode the entire thumb strip + its filters/toolbar
    // are hidden — show them muted with a hint so users don't tweak
    // settings that have no effect until preview-only is turned off.
    const previewOnly = !!cleanMode;
    const previewOnlyHint = previewOnly ? "Hidden while preview-only mode is on." : "";

    // Toolbar visibility — per-button toggles. IDs match v1 editor's
    // "Gallery toolbar" row so the existing event-wiring picks them up.
    // Toolbar buttons — drag-en-drop reorder + on/off, same UX as the
    // pill catalogs. Enabled state still lives in the existing show_*
    // keys; order lives in toolbar_order (sparse, defaults from catalog).
    const orderMap = (c.toolbar_order && typeof c.toolbar_order === "object") ? c.toolbar_order : {};
    const toolbarRowsOrdered = [...TOOLBAR_CATALOG]
      .map((entry) => ({
        entry,
        enabled: c[entry.showKey] !== false,
        order: typeof orderMap[entry.id] === "number" ? orderMap[entry.id] : entry.defaultOrder,
      }))
      .sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return (
          a.order - b.order ||
          TOOLBAR_CATALOG.findIndex((e) => e.id === a.entry.id) - TOOLBAR_CATALOG.findIndex((e) => e.id === b.entry.id)
        );
      });
    const toolbarBody = `
        <div class="row">
          <div class="desc">Show or hide individual buttons in the gallery's top toolbar. Drag <code>⠿</code> to reorder. The date picker is always visible and sits at the start.</div>
        </div>
        <div class="pills-dnd-list" id="toolbar-dnd-list">
          ${toolbarRowsOrdered
          .map((row) => {
            const entry = row.entry;
            const enabled = row.enabled;
            const idAttr = String(entry.id).replace(/"/g, "&quot;");
            const labelEsc = String(entry.label).replace(/</g, "&lt;");
            return `
                <div class="row pill-dnd-row ${enabled ? "" : "pill-dnd-disabled"}" data-toolbar-row="${idAttr}" draggable="true">
                  <div class="pill-dnd-line">
                    <span class="pill-drag-grip" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>
                    <div class="lbl pill-dnd-label">${labelEsc}</div>
                    <label class="cgc-switch"><input type="checkbox" id="toolbar-enable-${idAttr}" ${enabled ? "checked" : ""}><span class="cgc-track"></span></label>
                  </div>
                </div>
              `;
          })
          .join("")}
        </div>
      `;

    const filtersBody = `
        <div class="row">
          <div class="lbl">Object filters</div>
          <div class="desc">Filter clips by what was detected in them. Tap a chip to enable; click the color box to set its colour.</div>
          <div class="objmeta">
            <div class="countpill">Selected ${selectedCount}/${MAX_VISIBLE_OBJECT_FILTERS}</div>
          </div>

          <div class="chip-grid">
            ${AVAILABLE_OBJECT_FILTERS
            .map((obj) => {
              const isOn = objectFiltersArr.includes(obj);
              const currentColor = objectColors[obj] || "";
              const colorVal = currentColor && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(currentColor) ? currentColor : "#ffffff";
              return `
                <button
                  type="button"
                  class="objchip ${isOn ? "on" : ""}"
                  data-objchip="${obj}"
                  title="${this._objectLabel(obj)}"
                >
                  <span class="objchip-icon" ${currentColor ? `style="color:${currentColor}"` : ""}>
                    ${svgIcon(objectIcon(obj), 18)}
                  </span>
                  <span class="objchip-color">
                    <input type="color" class="cgc-color" value="${colorVal}" style="${!currentColor ? "opacity:0.35" : ""}" data-filtercolor="${obj}">
                  </span>
                  <input type="checkbox" class="objchip-native-check" ${isOn ? "checked" : ""} tabindex="-1" aria-hidden="true" style="pointer-events:none;">
                </button>
              `;
            })
            .join("")}
          </div>
        </div>

        <div class="row">
          <div class="lbl">Custom filters</div>
          <div class="desc">Add your own filter buttons (e.g. <code>parcel</code>, <code>mail-truck</code>). They match against detection labels found in clip filenames or sensor text.</div>

          <div class="custom-filter-add">
            <input type="text" class="ed-input" id="new-filter-name" placeholder="e.g. parcel" />
            <input type="text" class="ed-input" id="new-filter-icon" placeholder="mdi:shape" />
            <button class="actionbtn" id="add-filter-btn">
              ${svgIcon('mdi:plus', 18)}
              Add filter
            </button>
          </div>

          <div class="custom-filter-list">
            ${objectFiltersArr.filter(f => typeof f === 'object').map((f) => {
            const name = Object.keys(f)[0];
            const icon = f[name];
            const currentColor = objectColors[name] || "";
            const colorVal = currentColor && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(currentColor) ? currentColor : "#ffffff";
            return `
                <div class="custom-item">
                  <div class="custom-item-info">
                    <ha-icon icon="${icon}" style="${currentColor ? "color:" + currentColor : ""}"></ha-icon>
                    <span class="lbl">${this._objectLabel(name)}</span>
                  </div>
                  <div class="color-controls">
                    <input type="color" class="cgc-color" value="${colorVal}" style="${!currentColor ? "opacity:0.35" : ""}" data-filtercolor="${name}">
                    <button class="remove-btn" data-remove-index="${name}">
                      ${svgIcon('mdi:delete-outline', 18)}
                    </button>
                  </div>
                </div>
              `;
          }).join('')}
          </div>
        </div>
      `;

    const layoutBody = `
        <div class="row">
          <div class="lbl">Layout</div>
          <div class="desc">Horizontal arranged the thumbnails horizontally; Vertical... well...</div>
          <div class="segwrap">
            <button class="seg ${thumbLayout === "horizontal" ? "on" : ""}" data-tlayout="horizontal">Horizontal</button>
            <button class="seg ${thumbLayout === "vertical" ? "on" : ""}" data-tlayout="vertical">Vertical</button>
          </div>
        </div>

        <div class="row ${thumbSizeMuted ? "muted" : ""}">
          <div class="lbl">Size</div>
          <div class="desc">Size of each thumbnail, in pixels.</div>
          <div class="ed-input-row"><input type="number" class="ed-input" id="thumb" /><span class="ed-suffix">px</span></div>
        </div>

        <div class="row">
          <div class="lbl">Maximum thumbnails</div>
          <div class="desc">How many clips load into the thumbnail strip. Higher = more scrolling, slower first paint.</div>
          <div class="ed-input-row"><input type="number" class="ed-input" id="maxmedia" /><span class="ed-suffix">items</span></div>
        </div>

        <div class="row">
          <div class="lbl">Thumbnail bar position</div>
          <div class="segwrap">
            <button class="seg ${thumbBarPos === "top" ? "on" : ""}" data-tbpos="top">Top</button>
            <button class="seg ${thumbBarPos === "bottom" ? "on" : ""}" data-tbpos="bottom">Bottom</button>
            <button class="seg ${thumbBarPos === "hidden" ? "on" : ""}" data-tbpos="hidden">Hidden</button>
          </div>
        </div>

        <div class="row">
          <div class="lbl">Sort order</div>
          <div class="desc">Order clips in the thumbnail strip.</div>
          <div class="segwrap">
            <button class="seg ${thumbSortOrder === "newest" ? "on" : ""}" data-tsort="newest">Newest first</button>
            <button class="seg ${thumbSortOrder === "oldest" ? "on" : ""}" data-tsort="oldest">Oldest first</button>
          </div>
        </div>
      `;

    const videoFrameBody = `
        <div class="row">
          <div class="lbl">Video thumbnail frame</div>
          <div class="desc">% of the video to capture as thumbnail (0 = first frame, 100 = last)</div>
          <div class="barrow">
            <div class="barrow-top">
              <div class="pillval" id="thumbpctval">${thumbFramePct}%</div>
            </div>
            <input type="range" class="cgc-range" id="thumbpct" min="0" max="100" step="1">
          </div>
        </div>

        <div class="row">
          <div class="row-head">
            <div>
              <div class="lbl">Capture video thumbnails</div>
              <div class="desc">Extract a frame from each video when no server thumbnail is available. Off saves bandwidth on slow connections.</div>
            </div>
            <div class="togrow">
              <label class="cgc-switch"><input type="checkbox" id="capture-video-thumbnails" ${c.capture_video_thumbnails !== false ? "checked" : ""}><span class="cgc-track"></span></label>
            </div>
          </div>
        </div>
      `;

    return `
        <div class="tabpanel" data-panel="thumbs">
          ${v2ExpandToggle}
          ${v2Collapsible("thumb-layout", "Layout",      true,  layoutBody,     "mdi:view-grid-outline")}
          ${v2Collapsible("toolbar",      "Toolbar",     false, toolbarBody,    "mdi:tune", { muted: previewOnly, mutedHint: previewOnlyHint })}
          ${v2Collapsible("filters",      "Filters",     hasFilters && !previewOnly, filtersBody, "mdi:filter-outline", { muted: previewOnly, mutedHint: previewOnlyHint })}
          ${v2Collapsible("video-frame",  "Video frame", false, videoFrameBody, "mdi:play-circle-outline")}
        </div>
      `;
  }

  /** The Advanced tab. Part of _render(). */
  _renderAdvancedTab({
    mediaModeOn,
    deleteOk,
    deleteChoices,
    c,
    frigateDeleteOk,
    frigateDeleteChoices,
    v2ExpandToggle,
    v2Collapsible,
    deleteService,
    frigateDeleteService,
  }) {
    const parsingBody = `
        <div class="row">
          <div class="desc">
            ${svgIcon('mdi:information-outline', 14)}
            Pattern matched against your file paths. The detector covers both video and image files — extension is optional. Tokens: <code>YYYY</code> <code>MM</code> <code>DD</code> <code>HH</code> <code>mm</code> <code>ss</code>.
          </div>
          <div style="padding-top:8px;">
            <input type="text" class="ed-input" id="pathfmt" placeholder="e.g. YYYY/MM/DD/HHmmss" />
            <div class="row-actions" style="margin-top:8px;">
              <button type="button" class="actionbtn" id="detect-pathfmt" title="Probe configured sources and suggest a format" ?disabled=${this._detectInFlight}>
                ${svgIcon('mdi:magnify-scan', 18)}<span>${this._detectInFlight ? "Detecting…" : "Auto-detect format"}</span>
              </button>
            </div>
            <div id="detect-pathfmt-status" class="hint">${this._renderDetectStatusText()}</div>
            ${this._renderDetectScoreboard()}
          </div>
        </div>
      `;

    const deleteBody = `
        <div class="row">
          <div class="desc">Home Assistant service calls invoked when a clip is deleted. Required if you want the trash button to actually remove files.</div>
        </div>
        <div class="row ${mediaModeOn ? "row-disabled" : ""}">
          <div class="lbl">File sensor <span style="font-weight:400;color:var(--ed-text2);font-size:0.85em;">— used in file-sensor / combined mode</span></div>
          <div class="selectwrap" style="margin-top:4px;">
            <select class="select ${deleteOk ? "" : "invalid"}" id="delservice" ${mediaModeOn ? "disabled" : ""}>
              ${
              deleteChoices.length
                ? `<option value=""></option>` +
                  deleteChoices
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
        ${hasFrigateConfig(c) ? `
        <div class="row">
          <div class="lbl">Frigate <span style="font-weight:400;color:var(--ed-text2);font-size:0.85em;">— used for Frigate clips</span></div>
          <div class="selectwrap" style="margin-top:4px;">
            <select class="select ${frigateDeleteOk ? "" : "invalid"}" id="frigate-delservice">
              ${
              frigateDeleteChoices.length
                ? `<option value="">(none — Frigate delete disabled)</option>` +
                  frigateDeleteChoices
                    .map(
                      (id) =>
                        `<option value="${id}" ${
                          id === frigateDeleteService ? "selected" : ""
                        }>${id}</option>`
                    )
                    .join("")
                : `<option value="" selected>(no rest_command services found — add one to configuration.yaml)</option>`
            }
            </select>
            <span class="selarrow"></span>
          </div>
        </div>
        ` : ``}
      `;

    const diagnosticsBody = `
        <div class="row">
          <div class="row-head">
            <div>
              <div class="lbl">Debug mode</div>
              <div class="desc">Adds a small Debug badge on the live view; tapping it opens a diagnostics report (card version, HA info, runtime state). Handy when reporting bugs.</div>
            </div>
            <div class="togrow">
              <label class="cgc-switch"><input type="checkbox" id="debug-enabled" ${this._config?.debug_enabled ? "checked" : ""}><span class="cgc-track"></span></label>
            </div>
          </div>
        </div>
      `;

    const exportBody = `
        <div class="row">
          <div class="lbl">Copy YAML</div>
          <div class="desc">Copy the card's current YAML config to the clipboard. Useful for sharing your setup, backing up, or moving the card between dashboards.</div>
          <div class="row-actions">
            <button type="button" class="actionbtn" id="yaml-export-btn">
              ${svgIcon('mdi:content-copy', 18)}<span>Copy YAML</span>
            </button>
          </div>
        </div>
      `;

    const hasPathFmt = !!(this._config && this._config.path_datetime_format);

    return `
        <div class="tabpanel" data-panel="advanced">
          ${v2ExpandToggle}
          ${v2Collapsible("parsing",     "Path parsing",     hasPathFmt, parsingBody,      "mdi:calendar-outline")}
          ${v2Collapsible("delete",      "Delete services",  false,      deleteBody,       "mdi:delete-outline")}
          ${v2Collapsible("diagnostics", "Diagnostics",      false,      diagnosticsBody,  "mdi:information-outline")}
          ${v2Collapsible("export",      "Export YAML",      false,      exportBody,       "mdi:content-copy")}
        </div>
      `;
  }

  _renderSuggestions(id) {
    const box = this.shadowRoot?.getElementById(`${id}-suggestions`);
    if (!box) return;

    const state = this._suggestState[id] || {
      open: false,
      items: [],
      index: -1,
    };

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
    this._captureScrollState();

    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => {
      this._render();
      this._restoreScrollState();
    });
  }

  // Toolbar button helpers — enabled lives in the existing show_* keys
  // (BC), order in a sparse `toolbar_order` map. Catalog defaults are
  // pruned from both so YAML stays minimal.
  _setToolbarButtonEnabled(id, enabled) {
    const entry = TOOLBAR_CATALOG.find((e) => e.id === id);
    if (!entry) return;
    if (enabled) {
      // default true — drop the key so YAML stays clean.
      const next = { ...(this._config ?? {}) };
      delete next[entry.showKey];
      this._commit(next, { render: true });
    } else {
      this._set(entry.showKey, false);
    }
  }

  _reorderToolbarButtonTo(srcId, targetId) {
    if (!srcId || !targetId || srcId === targetId) return;
    const orderMap =
      this._config?.toolbar_order && typeof this._config.toolbar_order === "object"
        ? { ...this._config.toolbar_order }
        : {};
    const effOrder = (id) => {
      const entry = TOOLBAR_CATALOG.find((e) => e.id === id);
      if (typeof orderMap[id] === "number") return orderMap[id];
      return entry ? entry.defaultOrder : 0;
    };
    const ordered = [...TOOLBAR_CATALOG]
      .map((e) => e.id)
      .sort((a, b) => effOrder(a) - effOrder(b) ||
        TOOLBAR_CATALOG.findIndex((e) => e.id === a) - TOOLBAR_CATALOG.findIndex((e) => e.id === b)
      );
    const fromIdx = ordered.indexOf(srcId);
    const toIdx = ordered.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;

    const newOrder = [...ordered];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);

    const nextMap = {};
    newOrder.forEach((id, i) => {
      const entry = TOOLBAR_CATALOG.find((e) => e.id === id);
      const desired = (i + 1) * 10;
      if (entry && desired !== entry.defaultOrder) nextMap[id] = desired;
    });

    const next = { ...this._config };
    if (Object.keys(nextMap).length === 0) delete next.toolbar_order;
    else next.toolbar_order = nextMap;
    this._commit(next, { render: true });
  }

  // Live-pill overrides: same shape as gallery but writes to `live_pills`
  // and reads from `LIVE_PILL_CATALOG`. Editor UI ids are prefixed with
  // `live-pill-` so wiring stays unambiguous.
  _setLivePillEnabled(id, enabled) {
    const cur = (this._config?.live_pills && typeof this._config.live_pills === "object")
      ? { ...this._config.live_pills } : {};
    const entry = { ...(cur[id] || {}) };
    if (enabled) delete entry.enabled;
    else entry.enabled = false;
    this._commitLivePillEntry(cur, id, entry);
  }

  _commitLivePillEntry(map, id, entry) {
    if (entry.enabled === undefined && entry.order === undefined) {
      delete map[id];
    } else {
      map[id] = entry;
    }
    const next = { ...this._config };
    if (Object.keys(map).length === 0) delete next.live_pills;
    else next.live_pills = map;
    this._commit(next, { render: true });
  }

  // Gallery-pill overrides: write enabled+position into config, drop the
  // entry entirely when both fields are back at catalog default so YAML
  // stays minimal. Catalog defaults live in src/data/pill-catalog.ts.
  _setGalleryPillEnabled(id, enabled) {
    const cur = (this._config?.gallery_pills && typeof this._config.gallery_pills === "object")
      ? { ...this._config.gallery_pills } : {};
    const entry = { ...(cur[id] || {}) };
    if (enabled) delete entry.enabled; // default true
    else entry.enabled = false;
    this._commitGalleryPillEntry(cur, id, entry);
  }

  // Reorder: move srcId to the slot currently occupied by targetId.
  // After the move all pills get fresh orders in 10-step increments;
  // pills whose new order equals their catalog default get their
  // `order` override removed so the YAML stays clean.
  _reorderGalleryPillTo(srcId, targetId) {
    if (!srcId || !targetId || srcId === targetId) return;
    const cfgMap =
      this._config?.gallery_pills && typeof this._config.gallery_pills === "object"
        ? { ...this._config.gallery_pills }
        : {};
    const settings = resolvePillSettings(GALLERY_PILL_CATALOG, cfgMap);
    // Build the visual order across enabled + disabled (the editor list
    // shows both, so the user's drag target may be either).
    const visualView = new Map([...settings].map(([k, v]) => [k, { ...v, enabled: true }]));
    const ordered = sortPillsByOrder(GALLERY_PILL_CATALOG, visualView);
    const fromIdx = ordered.indexOf(srcId);
    const toIdx = ordered.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;

    const newOrder = [...ordered];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);

    newOrder.forEach((pillId, i) => {
      const catalogEntry = GALLERY_PILL_CATALOG.find((p) => p.id === pillId);
      const desired = (i + 1) * 10;
      const entry = { ...(cfgMap[pillId] || {}) };
      if (catalogEntry && desired === catalogEntry.defaultOrder) delete entry.order;
      else entry.order = desired;
      if (entry.enabled === undefined && entry.order === undefined) delete cfgMap[pillId];
      else cfgMap[pillId] = entry;
    });

    const next = { ...this._config };
    if (Object.keys(cfgMap).length === 0) delete next.gallery_pills;
    else next.gallery_pills = cfgMap;
    this._commit(next, { render: true });
  }

  _commitGalleryPillEntry(map, id, entry) {
    if (entry.enabled === undefined && entry.order === undefined) {
      delete map[id];
    } else {
      map[id] = entry;
    }
    const next = { ...this._config };
    if (Object.keys(map).length === 0) delete next.gallery_pills;
    else next.gallery_pills = map;
    this._commit(next, { render: true });
  }

  // Merge a patch into `live_triggers`, dropping values that equal the
  // defaults so an untouched block disappears from the YAML again.
  _setLiveTriggers(patch) {
    const merged = { ...(this._config.live_triggers || {}), ...patch };
    const DEFAULTS = { frigate: false, hold_seconds: 30, cooldown_seconds: 10, return_to: "previous" };
    for (const [k, v] of Object.entries(DEFAULTS)) if (merged[k] === v) delete merged[k];
    if (Array.isArray(merged.frigate_labels) && merged.frigate_labels.length === 0) delete merged.frigate_labels;
    if (!merged.frigate) delete merged.frigate_labels;
    const next = { ...this._config };
    if (Object.keys(merged).length) next.live_triggers = merged;
    else delete next.live_triggers;
    this._commit(next);
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
    const RENDERS_REQUIRED = new Set(["source_mode", "live_enabled", "live_camera_entities", "live_cameras", "object_filters", "delete_service", "frigate_delete_service", "menu_buttons", "frigate_url", "live_layout", "gallery_pills", "gallery_pills_align", "controls_mode", "bar_position"]);
    if (RENDERS_REQUIRED.has(key)) this._scheduleRender();
  }

  _setActiveTab(tab) {
    this._activeTab = String(tab || "source");
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
    // Run shared legacy-key migration so the saved YAML uses canonical keys.
    // The editor preserves the loose `object_filters` shape (string-or-object
    // entries) so user icon choices survive a YAML save round-trip — full
    // normalization happens on the card side.
    const { migrated, hadLegacyKeys } = migrateLegacyKeys(config || {});

    // Defaults the editor reads at render time. These don't propagate back to
    // YAML on their own — only legacy-key migrations trigger `_fire()`.
    if (typeof migrated.autoplay === "undefined") {
      migrated.autoplay = DEFAULT_AUTOPLAY;
    }
    if (typeof migrated.auto_muted === "undefined") {
      migrated.auto_muted = DEFAULT_AUTOMUTED;
    }
    if (typeof migrated.live_auto_muted === "undefined") {
      migrated.live_auto_muted = DEFAULT_LIVE_AUTO_MUTED;
    }

    // De-dup `object_filters` while preserving the original entry form
    // (string OR `{name: icon}` object). Editor needs the icon-bearing form
    // to round-trip user icon choices through YAML.
    let objectFiltersChanged = false;
    if ("object_filters" in migrated) {
      const before = Array.isArray(migrated.object_filters)
        ? migrated.object_filters
        : migrated.object_filters
          ? [migrated.object_filters]
          : [];
      const deduped = this._normalizeObjectFilters(before);
      if (JSON.stringify(deduped) !== JSON.stringify(migrated.object_filters)) {
        objectFiltersChanged = true;
      }
      if (deduped.length) {
        migrated.object_filters = deduped;
      } else {
        delete migrated.object_filters;
      }
    }

    this._config = this._stripAlwaysTrueKeys(migrated);

    if (hadLegacyKeys || objectFiltersChanged) {
      this._fire();
    }


    this._scheduleRender();
  }

  set hass(hass) {
    const prev = this._hass;
    this._hass = hass;
    // HA entity pickers (#287) need fresh hass for their entity list.
    this.shadowRoot?.querySelectorAll("ha-entity-picker").forEach((p) => { p.hass = hass; });
    this._loadHaPickers();

    if (this._mediaBrowserOpen) return;

    const ae = this.shadowRoot?.activeElement;
    const tag = String(ae?.tagName || "").toLowerCase();
    const id = String(ae?.id || "");

    const interacting = !!(
      ae &&
      (tag === "input" ||
        tag === "ha-entity-picker" ||
        tag === "textarea" ||
        id === "entities" ||
        id === "mediasources" ||
        id === "pathfmt" ||
        id === "thumb" ||
        id === "maxmedia" ||
        id === "new-filter-name" ||
        id === "new-filter-icon")
    );

    if (interacting) return;

    // Alleen renderen als relevante hass-data echt veranderd is
    if (prev) {
      const relevantChanged =
        prev.themes?.darkMode !== hass.themes?.darkMode ||
        JSON.stringify(Object.keys(prev.states).filter(k => k.startsWith("camera.") || k.startsWith("sensor."))) !==
        JSON.stringify(Object.keys(hass.states).filter(k => k.startsWith("camera.") || k.startsWith("sensor.")));

      if (!relevantChanged) return;
    }

    this._scheduleRender();
  }

  // Automatic icon for an entity: entity settings, attribute, class, domain.
  _entityIcon(id) {
    return id ? defaultEntityIcon(id, this._hass?.states?.[id], this._hass?.entities?.[id]) : "";
  }

  // Make sure Home Assistant's own entity picker is defined (#287). It is
  // lazy-loaded by HA, so ask a built-in card for its editor, which pulls the
  // picker in. Re-renders once when it becomes available; until then (or if
  // it never loads) the editor keeps its own entity search.
  async _loadHaPickers() {
    if (this._haPickersRequested) return;
    this._haPickersRequested = true;
    if (customElements.get("ha-entity-picker")) return;
    try {
      const helpers = await window.loadCardHelpers?.();
      const card = await helpers?.createCardElement?.({ type: "entities", entities: [] });
      await card?.constructor?.getConfigElement?.();
      await Promise.race([
        customElements.whenDefined("ha-entity-picker"),
        new Promise((r) => setTimeout(r, 5000)),
      ]);
      if (customElements.get("ha-entity-picker")) this._scheduleRender();
    } catch (_) {
      /* keep the built-in entity search */
    }
  }

  // Swap one of our entity inputs for HA's entity picker. The input stays in
  // the DOM (hidden) as the value holder and fallback. Returns false when the
  // picker is not available.
  _mountHaEntityPicker(input, sugg, onSelect) {
    if (!input || !customElements.get("ha-entity-picker")) return false;
    const picker = document.createElement("ha-entity-picker");
    picker.hass = this._hass;
    picker.value = input.value || "";
    picker.allowCustomEntity = true;
    picker.style.display = "block";
    picker.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      const id = String(ev.detail?.value || "");
      input.value = id;
      onSelect(id);
    });
    input.style.display = "none";
    if (sugg) sugg.hidden = true;
    input.parentElement?.insertBefore(picker, input);
    return true;
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


  /**
   * Save a new config: drop keys that only repeat a default, tell HA about
   * the change, and re-render when asked (not while the user is typing in a
   * field, so it keeps its focus).
   */
  _commit(next, { render = false } = {}) {
    this._config = this._stripAlwaysTrueKeys(next);
    this._fire();
    if (render) this._scheduleRender();
  }

  /** The `live_cameras` entry of an entity camera, or undefined. */
  _liveCameraEntry(id) {
    const cams = Array.isArray(this._config?.live_cameras) ? this._config.live_cameras : [];
    return cams.find((lc) => lc && lc.entity === id);
  }

  /**
   * Set or clear fields on one entity camera's `live_cameras` entry, adding
   * the entry when the camera has none yet. A field set to undefined, null
   * or "" is removed, so the YAML stays clean. Re-renders only on request,
   * so text inputs keep their focus.
   */
  _updateLiveCamera(id, patch, { render = false } = {}) {
    const cams = Array.isArray(this._config.live_cameras) ? [...this._config.live_cameras] : [];
    let idx = cams.findIndex((lc) => lc && lc.entity === id);
    if (idx < 0) {
      cams.push({ entity: id });
      idx = cams.length - 1;
    }
    const entry = { ...cams[idx] };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === null || value === "") delete entry[key];
      else entry[key] = value;
    }
    cams[idx] = entry;
    this._commit({ ...this._config, live_cameras: cams }, { render });
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
      .replace(/^media-source:\/\/frigate\//, "frigate/")
      .replace(/^media-source:\/\/frigate/, "frigate")
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

    this._commit(next, { render: true });
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

  _renderFilesWizard() {
    const s = this._wizardStatus;
    const loading = s === "loading";
    return `
      <div class="cgc-wizard">
        <button class="cgc-wizard-toggle" id="cgc-wizard-toggle">
          ${this._wizardOpen ? "▾" : "▸"} Create new FileTrack sensor
        </button>
        <a class="cgc-wizard-link" href="https://github.com/TheScubaDiver/FileTrack" target="_blank" rel="noopener">FileTrack on GitHub</a>
        ${this._wizardOpen ? `
          <div class="cgc-wizard-body">
            <div class="cgc-wizard-row">
              <div class="cgc-wizard-folder-row">
                <span class="cgc-wizard-prefix">/config/www/</span>
                <input type="text" class="ed-input" id="cgc-wizard-folder" value="${this._wizardFolder}" />
              </div>
            </div>
            <div class="cgc-wizard-row">
              <div class="cgc-wizard-folder-row">
                <span class="cgc-wizard-prefix">sensor.</span>
                <input type="text" class="ed-input" id="cgc-wizard-name" value="${this._wizardName}" />
              </div>
            </div>
            <button class="cgc-wizard-btn" id="cgc-wizard-create" ${!this._wizardFolder || !this._wizardName || loading ? "disabled" : ""}>
              ${loading ? "Creating…" : "Create sensor"}
            </button>
            ${s?.ok === true ? `
              <div class="cgc-wizard-success">
                ✓ Sensor created! Select <code>${s.entityId}</code> in the sensor field above.
              </div>
            ` : ""}
            ${s?.ok === false ? `
              <div class="cgc-wizard-error">✗ ${s.error}</div>
            ` : ""}
          </div>
        ` : ""}
      </div>
    `;
  }

  _bindWizardEvents(sig = {}) {
    const root = this.shadowRoot;
    const toggle = root?.getElementById("cgc-wizard-toggle");
    const folderInput = root?.getElementById("cgc-wizard-folder");
    const nameInput = root?.getElementById("cgc-wizard-name");
    const createBtn = root?.getElementById("cgc-wizard-create");

    if (toggle) {
      toggle.onclick = () => {
        this._wizardOpen = !this._wizardOpen;
        this._scheduleRender();
      };
    }
    if (folderInput) {
      folderInput.oninput = (e) => {
        this._wizardFolder = e.target.value;
        this._wizardStatus = null;
        this._updateWizardButton();
      };
    }
    if (nameInput) {
      nameInput.oninput = (e) => {
        const normalized = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
        this._wizardName = normalized;
        e.target.value = normalized;
        this._wizardStatus = null;
        this._updateWizardButton();
      };
    }
    if (createBtn) {
      createBtn.onclick = () => this._createFilesSensor();
    }
  }

  _updateWizardButton() {
    const btn = this.shadowRoot?.getElementById("cgc-wizard-create");
    if (!btn) return;
    btn.disabled = !this._wizardFolder || !this._wizardName;
  }

  async _createFilesSensor() {
    const folderInput = this.shadowRoot?.getElementById("cgc-wizard-folder");
    const nameInput = this.shadowRoot?.getElementById("cgc-wizard-name");
    const createBtn = this.shadowRoot?.getElementById("cgc-wizard-create");

    const folder = (folderInput?.value || this._wizardFolder).trim().replace(/^\//, "").replace(/\/$/, "");
    const name = (nameInput?.value || this._wizardName).trim();

    if (!folder || !name) return;
    this._wizardFolder = folder;
    this._wizardName = name;

    if (createBtn) { createBtn.disabled = true; createBtn.textContent = "Bezig…"; }

    try {
      await this._hass.callService("filetrack", "add_sensor", {
        name,
        folder: "/config/www/" + folder,
        filter: "*",
        sort: "date",
        recursive: false,
      });

      const entityId = "sensor." + name
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");

      this._wizardStatus = { ok: true, entityId };
    } catch (e) {
      const msg = (e?.message || String(e)).toLowerCase();
      const folderExists = msg.includes("exist") || msg.includes("already") || msg.includes("fileexist");
      if (folderExists) {
        const entityId = "sensor." + name
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_|_$/g, "");
        this._wizardStatus = { ok: true, entityId };
      } else {
        this._wizardStatus = { ok: false, error: e?.message || String(e) };
      }
    }
    this._scheduleRender();
  }
}

if (!customElements.get("camera-gallery-card-editor")) {
  customElements.define(
    "camera-gallery-card-editor",
    CameraGalleryCardEditor
  );
}
