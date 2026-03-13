/**
 * Camera Gallery Card
 */

const CARD_VERSION = "1.7.0";

// -------- HARD CODED SETTINGS --------
const ATTR_NAME = "fileList";
const PREVIEW_WIDTH = "100%";

const SENSOR_POSTER_CONCURRENCY = 1;
const SENSOR_POSTER_QUEUE_LIMIT = 10;

const THUMBS_ENABLED = true;

const THUMB_GAP = 2;
const THUMB_RADIUS = 14;
const THUMB_SIZE = 86;

const DEFAULT_ALLOW_BULK_DELETE = true;
const DEFAULT_ALLOW_DELETE = true;
const DEFAULT_BAR_OPACITY = 45;
const DEFAULT_BROWSE_TIMEOUT_MS = 8000;
const DEFAULT_DELETE_CONFIRM = true;
const DEFAULT_DELETE_PREFIX = "/config/www/";
const DEFAULT_DELETE_SERVICE = "";
const DEFAULT_FILENAME_DATETIME_FORMAT = "";
const DEFAULT_LIVE_ENABLED = false;
const DEFAULT_MAX_MEDIA = 20;
const DEFAULT_PER_ROOT_MIN_LIMIT = 40;
const DEFAULT_PREVIEW_CLICK_TO_OPEN = false;
const DEFAULT_PREVIEW_CLOSE_ON_TAP_WHEN_GATED = true;
const DEFAULT_PREVIEW_POSITION = "top"; // "top" | "bottom"
const DEFAULT_RESOLVE_BATCH = 4;
const DEFAULT_SOURCE_MODE = "sensor"; // "sensor" | "media"
const DEFAULT_THUMB_BAR_POSITION = "bottom"; // "bottom" | "top" | "hidden"
const DEFAULT_THUMB_LAYOUT = "horizontal"; // "horizontal" | "vertical"
const DEFAULT_VISIBLE_OBJECT_FILTERS = [];
const DEFAULT_WALK_DEPTH = 8;

const MAX_VISIBLE_OBJECT_FILTERS = 9;

const THUMB_LONG_PRESS_MOVE_PX = 12;
const THUMB_LONG_PRESS_MS = 520;

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
  "visitor",
];

const STYLE = {
  card_background:
    "rgba(var(--rgb-card-background-color, 255,255,255), 0.50)",
  card_padding: "10px 12px",
  preview_background:
    "rgba(var(--rgb-card-background-color, 255,255,255), 0.50)",
  topbar_margin: "0px",
  topbar_padding: "0px",
};
// ------------------------------------

// ─── Resolve Lit from HA ─────────────────────────────────────────────
let LitElement, html, css;

(() => {
  const candidates = [
    "hui-masonry-view",
    "hui-view",
    "ha-panel-lovelace",
    "hc-lovelace",
    "hui-entities-card",
    "ha-card",
  ];
  for (const tag of candidates) {
    const klass = customElements.get(tag);
    if (!klass) continue;
    let proto = klass;
    while (proto && proto !== HTMLElement && proto !== Object) {
      if (proto.prototype?.html && proto.prototype?.css) {
        LitElement = proto;
        html = proto.prototype.html;
        css = proto.prototype.css;
        return;
      }
      proto = Object.getPrototypeOf(proto);
    }
  }
})();

if (!LitElement) {
  console.error("CAMERA-GALLERY-CARD: Could not resolve LitElement from HA");
}

class CameraGalleryCard extends LitElement {
  static get properties() {
    return {
      _hass: {},
      config: {},

      _liveSelectedCamera: { type: String },
      _objectFilters: { type: Array },
      _pendingScrollToI: { type: Number },
      _previewOpen: { type: Boolean },
      _selectedDay: { type: String },
      _selectedIndex: { type: Number },
      _selectedSet: { type: Object },
      _selectMode: { type: Boolean },
      _showBulkHint: { type: Boolean },
      _showLivePicker: { type: Boolean },
      _showLiveQuickSwitch: { type: Boolean },
      _showNav: { type: Boolean },
      _suppressNextThumbClick: { type: Boolean },
      _swipeStartX: { type: Number },
      _swipeStartY: { type: Number },
      _swiping: { type: Boolean },
      _thumbMenuItem: { type: Object },
      _thumbMenuOpen: { type: Boolean },
      _viewMode: { type: String }, // "media" | "live"
    };
  }

  static async getConfigElement() {
    await import("/hacsfiles/camera-gallery-card/camera-gallery-card-editor.js");
    return document.createElement("camera-gallery-card-editor");
  }

  static getStubConfig() {
    return {
      allow_bulk_delete: DEFAULT_ALLOW_BULK_DELETE,
      allow_delete: DEFAULT_ALLOW_DELETE,
      bar_opacity: DEFAULT_BAR_OPACITY,
      bar_position: "top",
      delete_confirm: DEFAULT_DELETE_CONFIRM,
      delete_service: "",
      entities: [],
      entity: "",
      entity_filter_map: {},
      filename_datetime_format: DEFAULT_FILENAME_DATETIME_FORMAT,
      live_camera_entity: "",
      live_enabled: DEFAULT_LIVE_ENABLED,
      max_media: DEFAULT_MAX_MEDIA,
      media_source: "",
      media_sources: [],
      object_filters: DEFAULT_VISIBLE_OBJECT_FILTERS,
      preview_click_to_open: DEFAULT_PREVIEW_CLICK_TO_OPEN,
      preview_close_on_tap: DEFAULT_PREVIEW_CLOSE_ON_TAP_WHEN_GATED,
      preview_height: 320,
      preview_position: DEFAULT_PREVIEW_POSITION,
      style_variables: "",
      source_mode: DEFAULT_SOURCE_MODE,
      thumb_bar_position: DEFAULT_THUMB_BAR_POSITION,
      thumb_layout: DEFAULT_THUMB_LAYOUT,
      thumb_size: 140,
    };
  }

  constructor() {
    super();

    this._previewMediaKey = "";
    this._previewVideoEl = null;
    this._prefetchKey = "";
    this._selectedPreviewSrc = "";
    this._deleted = new Set();
    this._forceThumbReset = false;
    this._liveCard = null;
    this._liveCardConfigKey = "";
    this._liveQuickSwitchTimer = null;
    this._navHideT = null;
    this._objectFilters = [];
    this._pendingScrollToI = null;
    this._posterCache = new Map();
    this._posterPending = new Set();
    this._snapshotCache = new Map();
    this._frigateSnapshots = [];
    this._objectCache = new Map();
    this._previewOpen = false;
    this._selectMode = false;
    this._selectedSet = new Set();
    this._showBulkHint = false;
    this._bulkHintTimer = null;
    this._showLivePicker = false;
    this._showLiveQuickSwitch = false;
    this._showNav = false;
    this._srcEntityMap = new Map();
    this._suppressNextThumbClick = false;
    this._swipeStartX = 0;
    this._swipeStartY = 0;
    this._swiping = false;
    this._thumbLongPressStartX = 0;
    this._thumbLongPressStartY = 0;
    this._thumbLongPressTimer = null;
    this._thumbMenuItem = null;
    this._thumbMenuOpen = false;
    this._thumbMenuOpenedAt = 0;
    this._viewMode = "media";
    this._liveSelectedCamera = "";

    this._ms = {
      key: "",
      list: [],
      loadedAt: 0,
      loading: false,
      roots: [],
      urlCache: new Map(),
    };

    this._msResolveInFlight = false;
    this._msResolveQueued = new Set();

    this._posterQueue = [];
    this._posterQueued = new Set();
    this._posterInFlight = new Set();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    if (this._liveQuickSwitchTimer) clearTimeout(this._liveQuickSwitchTimer);
    if (this._navHideT) clearTimeout(this._navHideT);
    if (this._bulkHintTimer) clearTimeout(this._bulkHintTimer);

    this._liveQuickSwitchTimer = null;
    this._navHideT = null;
    this._bulkHintTimer = null;

    this._clearPreviewVideoHostPlayback();

    this._clearThumbLongPress();
  }

  set hass(hass) {
    this._hass = hass;
    this.requestUpdate();
  }

  get hass() {
    return this._hass;
  }

  // ─── Generic helpers ───────────────────────────────────────────────

  _syncPreviewPlaybackFromState() {
    if (!this._hass || !this.config) return;

    const usingMediaSource = this.config?.source_mode === "media";
    const rawItems = this._items();

    if (!rawItems.length) {
      this._clearPreviewVideoHostPlayback();
      return;
    }

    const withDt = rawItems.map((src, idx) => {
      const dtMs = this._dtMsFromSrc(src);
      const dayKey = this._extractDayKey(src);
      return { dayKey, dtMs, idx, src };
    });

    withDt.sort((a, b) => {
      const aOk = Number.isFinite(a.dtMs);
      const bOk = Number.isFinite(b.dtMs);
      if (aOk && bOk && b.dtMs !== a.dtMs) return b.dtMs - a.dtMs;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return b.idx - a.idx;
    });

    const allWithDay = withDt.map((x) => ({ dayKey: x.dayKey, src: x.src }));
    const days = this._uniqueDays(allWithDay);
    const newestDay = days[0] ?? null;
    const activeDay = this._selectedDay ?? newestDay;

    const dayFiltered = !activeDay
      ? allWithDay
      : allWithDay.filter((x) => x.dayKey === activeDay);

    const filteredAll = dayFiltered.filter((x) =>
      this._matchesObjectFilter(x.src)
    );

    const cap = this._normMaxMedia(this.config?.max_media);
    const filtered = filteredAll.slice(0, Math.min(cap, filteredAll.length));

    if (!filtered.length) {
      this._clearPreviewVideoHostPlayback();
      return;
    }

    const idx = Math.min(
      Math.max(this._selectedIndex ?? 0, 0),
      Math.max(0, filtered.length - 1)
    );

    const selected = filtered[idx]?.src || "";
    if (!selected) {
      this._clearPreviewVideoHostPlayback();
      return;
    }

    let selectedUrl = selected;
    if (this._isMediaSourceId(selected)) {
      selectedUrl = this._ms?.urlCache?.get(selected) || "";
    }

    let selectedMime = "";
    let selectedCls = "";
    let selectedTitle = "";

    if (usingMediaSource && this._isMediaSourceId(selected)) {
      const meta = this._msMetaById(selected);
      selectedMime = meta.mime;
      selectedCls = meta.cls;
      selectedTitle = meta.title;
    }

    const selectedIsVideo =
      !!selected &&
      this._isVideoSmart(selectedUrl || selectedTitle, selectedMime, selectedCls);

    const previewGated = !!this.config?.preview_click_to_open;
    const previewOpen = !previewGated || !!this._previewOpen;
    const selectedNeedsResolve =
      !!selected && usingMediaSource && this._isMediaSourceId(selected);
    const selectedHasUrl = !!selected && (!selectedNeedsResolve || !!selectedUrl);

    const mediaKey = JSON.stringify({
      selected,
      selectedUrl,
      selectedIsVideo,
      previewOpen,
      selectedHasUrl,
      isLive: this._isLiveActive(),
    });

    if (this._previewMediaKey === mediaKey) return;
    this._previewMediaKey = mediaKey;

    if (!previewOpen || this._isLiveActive() || !selectedHasUrl || !selectedIsVideo) {
      this._clearPreviewVideoHostPlayback();
      return;
    }

    this._ensurePreviewVideoHostPlayback(selectedUrl);
  }

  _enqueuePoster(src) {
    const key = String(src || "").trim();
    if (!key) return;
    if (this.config?.source_mode !== "sensor") return;
    if (this._posterCache.has(key)) return;
    if (this._posterPending.has(key)) return;
    if (this._posterQueued.has(key)) return;
    if (this._posterInFlight.has(key)) return;

    this._posterQueued.add(key);
    this._posterQueue.push(key);

    if (this._posterQueue.length > SENSOR_POSTER_QUEUE_LIMIT) {
      const overflow = this._posterQueue.splice(
        0,
        this._posterQueue.length - SENSOR_POSTER_QUEUE_LIMIT
      );
      for (const oldSrc of overflow) {
        this._posterQueued.delete(oldSrc);
      }
    }

    this._drainPosterQueue();
  }

  _drainPosterQueue() {
    while (
      this._posterInFlight.size < SENSOR_POSTER_CONCURRENCY &&
      this._posterQueue.length
    ) {
      const src = this._posterQueue.shift();
      this._posterQueued.delete(src);

      if (!src) continue;
      if (this._posterCache.has(src)) continue;
      if (this._posterPending.has(src)) continue;
      if (this._posterInFlight.has(src)) continue;

      this._posterInFlight.add(src);

      this._ensurePoster(src)
        .catch(() => {})
        .finally(() => {
          this._posterInFlight.delete(src);
          this._drainPosterQueue();
        });
    }
  }

  _resetPosterQueue() {
    this._posterQueue = [];
    this._posterQueued.clear();
    this._posterInFlight.clear();
  }

  _queueSensorPosterWork(items) {
    if (!Array.isArray(items) || !items.length) return;
    if (this.config?.source_mode !== "sensor") return;

    for (const it of items) {
      const src = String(it?.src || "");
      if (!src) continue;
      if (!this._isVideo(src)) continue;
      this._enqueuePoster(src);
    }
  }

  _ensurePreviewVideoHostPlayback(selectedUrl) {
    const host = this.renderRoot?.querySelector("#preview-video-host");
    if (!host || !selectedUrl) return;

    let video = this._previewVideoEl;

    if (!video || video.parentElement !== host) {
      host.innerHTML = "";

      video = document.createElement("video");
      video.className = "pimg";
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";

      host.appendChild(video);
      this._previewVideoEl = video;
    }

    if (video.src !== selectedUrl) {
      video.src = selectedUrl;

      const poster = this._posterCache.get(selectedUrl) || "";
      if (poster) {
        video.poster = poster;
      } else {
        video.removeAttribute("poster");
      }

      try {
        video.load();
      } catch (_) {}
    } else {
      const poster = this._posterCache.get(selectedUrl) || "";
      if (poster && video.poster !== poster) {
        video.poster = poster;
      }
    }
  }

  _clearPreviewVideoHostPlayback() {
    const host = this.renderRoot?.querySelector("#preview-video-host");

    if (this._previewVideoEl) {
      try {
        this._previewVideoEl.pause();
      } catch (_) {}

      this._previewVideoEl.removeAttribute("src");
      this._previewVideoEl.removeAttribute("poster");

      try {
        this._previewVideoEl.load();
      } catch (_) {}
    }

    this._previewVideoEl = null;
    this._previewMediaKey = "";

    if (host) {
      host.innerHTML = "";
    }
  }

  _buildFilenameDateRegex(format) {
    const fmt = String(format || "").trim();
    if (!fmt) return null;

    const supportedTokens = ["YYYY", "YY", "MM", "DD", "HH", "mm", "ss"];
    const tokenRegex = /(YYYY|YY|MM|DD|HH|mm|ss)/g;

    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    let regexStr = "";
    let lastIndex = 0;
    const fields = [];

    let match;
    while ((match = tokenRegex.exec(fmt)) !== null) {
      const token = match[0];
      const idx = match.index;

      if (idx > lastIndex) {
        regexStr += escapeRegex(fmt.slice(lastIndex, idx));
      }

      if (token === "YYYY") {
        regexStr += "(\\d{4})";
        fields.push("year");
      } else if (token === "YY") {
        regexStr += "(\\d{2})";
        fields.push("year2");
      } else if (token === "MM") {
        regexStr += "(\\d{2})";
        fields.push("month");
      } else if (token === "DD") {
        regexStr += "(\\d{2})";
        fields.push("day");
      } else if (token === "HH") {
        regexStr += "(\\d{2})";
        fields.push("hour");
      } else if (token === "mm") {
        regexStr += "(\\d{2})";
        fields.push("minute");
      } else if (token === "ss") {
        regexStr += "(\\d{2})";
        fields.push("second");
      }

      lastIndex = idx + token.length;
    }

    if (lastIndex < fmt.length) {
      regexStr += escapeRegex(fmt.slice(lastIndex));
    }

    if (!fields.length) return null;

    return {
      regex: new RegExp(regexStr),
      fields,
    };
  }

  _scheduleVisibleMediaWork(selected, filtered, idx, usingMediaSource) {
    const selectedSrc = String(selected || "");
    const cap = this._normMaxMedia(this.config?.max_media);
    const thumbRenderLimit = this._getThumbRenderLimit(cap, usingMediaSource);

    const visibleThumbIds = usingMediaSource
      ? filtered
          .slice(0, thumbRenderLimit)
          .map((x) => String(x?.src || ""))
          .filter((src) => src && this._isMediaSourceId(src))
      : [];

    const key = JSON.stringify({
      selectedSrc,
      visibleThumbIds,
      usingMediaSource: !!usingMediaSource,
    });

    if (this._prefetchKey === key) return;
    this._prefetchKey = key;

    queueMicrotask(() => {
      if (!this.isConnected) return;

      if (usingMediaSource) {
        const want = [];

        if (selectedSrc && this._isMediaSourceId(selectedSrc)) {
          want.push(selectedSrc);
        }

        for (const src of visibleThumbIds) {
          if (src !== selectedSrc) want.push(src);
        }

        if (want.length) {
          this._msQueueResolve(want);
        }
      }

      this._selectedPreviewSrc = selectedSrc;
    });
  }

  _normalizeEntityFilterMap(mapObj) {
    const out = {};
    const allowed = new Set(
      AVAILABLE_OBJECT_FILTERS.map((x) => String(x).toLowerCase())
    );

    if (!mapObj || typeof mapObj !== "object" || Array.isArray(mapObj)) {
      return out;
    }

    for (const [entityId, rawFilter] of Object.entries(mapObj)) {
      const e = String(entityId || "").trim();
      const f = String(rawFilter || "").toLowerCase().trim();

      if (!e || !f || !allowed.has(f)) continue;
      out[e] = f;
    }

    return out;
  }

  _parseDateFromFilename(src, format) {
    const name = this._sourceNameForParsing(src);
    if (!name || !format) return null;

    try {
      const built = this._buildFilenameDateRegex(format);
      if (!built?.regex || !built?.fields?.length) return null;

      const match = String(name).match(built.regex);
      if (!match) return null;

      let year = null;
      let month = null;
      let day = null;
      let hour = 0;
      let minute = 0;
      let second = 0;

      built.fields.forEach((field, i) => {
        const value = match[i + 1];
        if (value == null) return;

        if (field === "year") year = Number(value);
        if (field === "year2") year = 2000 + Number(value);
        if (field === "month") month = Number(value);
        if (field === "day") day = Number(value);
        if (field === "hour") hour = Number(value);
        if (field === "minute") minute = Number(value);
        if (field === "second") second = Number(value);
      });

      if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day)
      ) {
        return null;
      }

      if (month < 1 || month > 12) return null;
      if (day < 1 || day > 31) return null;
      if (hour < 0 || hour > 23) return null;
      if (minute < 0 || minute > 59) return null;
      if (second < 0 || second > 59) return null;

      const y = String(year).padStart(4, "0");
      const mo = String(month).padStart(2, "0");
      const d = String(day).padStart(2, "0");
      const hh = String(hour).padStart(2, "0");
      const mm = String(minute).padStart(2, "0");
      const ss = String(second).padStart(2, "0");

      const dtKey = `${y}-${mo}-${d}T${hh}:${mm}:${ss}`;
      const ms = new Date(dtKey).getTime();

      if (!Number.isFinite(ms)) return null;

      return {
        dayKey: `${y}-${mo}-${d}`,
        dtKey,
        ms,
      };
    } catch (_) {
      return null;
    }
  }

  _getAllLiveCameraEntities() {
    const states = this._hass?.states || {};

    return Object.keys(states)
      .filter((entityId) => entityId.startsWith("camera."))
      .filter((entityId) => {
        const st = states[entityId];
        if (!st) return false;

        const state = String(st.state || "").toLowerCase();
        if (state === "unavailable" || state === "unknown") return false;

        return true;
      })
      .sort((a, b) => {
        const an = this._friendlyCameraName(a).toLowerCase();
        const bn = this._friendlyCameraName(b).toLowerCase();
        return an.localeCompare(bn, this._locale());
      });
  }

  _configChangedKeys(prev = {}, next = {}) {
    const keys = new Set([
      ...Object.keys(prev || {}),
      ...Object.keys(next || {}),
    ]);
    return Array.from(keys).filter((k) => !this._jsonEq(prev?.[k], next?.[k]));
  }

  _thumbCanMultipleDelete() {
    if (this.config?.source_mode !== "sensor") return false;
    if (!this.config?.allow_delete || !this.config?.allow_bulk_delete) return false;
    return !!this._serviceParts();
  }

  _friendlyCameraName(entityId) {
    const id = String(entityId || "").trim();
    if (!id) return "";

    const st = this._hass?.states?.[id];
    const friendly = String(st?.attributes?.friendly_name || "").trim();
    if (friendly) return friendly;

    const raw = id.split(".").pop() || id;
    const label = raw.replace(/_/g, " ").trim();
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : id;
  }

  _isDarkMode() {
    const dm = this._hass?.themes?.darkMode;
    if (typeof dm === "boolean") return dm;
    try {
      return (
        window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false
      );
    } catch (_) {
      return false;
    }
  }

  _isThumbLayoutVertical() {
    return this.config?.thumb_layout === "vertical";
  }

  _jsonEq(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  _locale() {
    const hassLocale = this._hass?.locale;
    if (typeof hassLocale === "string" && hassLocale.trim()) {
      return hassLocale.trim();
    }
    if (
      hassLocale &&
      typeof hassLocale === "object" &&
      typeof hassLocale.language === "string" &&
      hassLocale.language.trim()
    ) {
      return hassLocale.language.trim();
    }
    if (
      typeof this._hass?.language === "string" &&
      this._hass.language.trim()
    ) {
      return this._hass.language.trim();
    }
    if (typeof navigator !== "undefined" && navigator.language) {
      return navigator.language;
    }
    return undefined;
  }

  _pathHasClass(path = [], cls = "") {
    return path.some((el) => el?.classList?.contains(cls));
  }

  _showNavChevrons() {
    this._showNav = true;
    this.requestUpdate();

    if (this._navHideT) clearTimeout(this._navHideT);
    this._navHideT = setTimeout(() => {
      this._showNav = false;
      this.requestUpdate();
    }, 2500);
  }

  _hideBulkDeleteHint() {
    if (this._bulkHintTimer) {
      clearTimeout(this._bulkHintTimer);
      this._bulkHintTimer = null;
    }
    if (!this._showBulkHint) return;
    this._showBulkHint = false;
    this.requestUpdate();
  }

  _showBulkDeleteHint() {
    if (this._bulkHintTimer) {
      clearTimeout(this._bulkHintTimer);
      this._bulkHintTimer = null;
    }

    this._showBulkHint = true;
    this.requestUpdate();

    this._bulkHintTimer = setTimeout(() => {
      this._showBulkHint = false;
      this._bulkHintTimer = null;
      this.requestUpdate();
    }, 5000);
  }

  // ─── Normalizers / config helpers ─────────────────────────────────

  _getVisibleObjectFilters() {
    return Array.isArray(this.config?.object_filters)
      ? this.config.object_filters
      : [];
  }

  _hasLiveConfig() {
    if (!this.config?.live_enabled) return false;
    return this._getLiveCameraOptions().length > 0;
  }

  _isLiveActive() {
    return this._hasLiveConfig() && this._viewMode === "live";
  }

  _isSourceConfigChange(keys = []) {
    const sourceKeys = new Set([
      "allow_bulk_delete",
      "allow_delete",
      "delete_confirm",
      "delete_service",
      "entities",
      "entity",
      "max_media",
      "media_source",
      "media_sources",
      "source_mode",
    ]);

    return keys.some((k) => sourceKeys.has(k));
  }

  _isUiOnlyConfigChange(keys = []) {
    if (!keys.length) return false;

    const uiOnlyKeys = new Set([
      "bar_opacity",
      "bar_position",
      "live_camera_entity",
      "live_cameras",
      "live_default_camera",
      "live_enabled",
      "object_filters",
      "preview_click_to_open",
      "preview_close_on_tap",
      "preview_height",
      "preview_position",
      "thumb_bar_position",
      "thumb_layout",
      "thumb_size",
    ]);

    return keys.every((k) => uiOnlyKeys.has(k));
  }

  _normMaxMedia(v) {
    const n = Number(String(v ?? "").trim());
    if (!Number.isFinite(n)) return DEFAULT_MAX_MEDIA;
    return Math.max(1, Math.min(100, Math.round(n)));
  }

  _normPrefixHardcoded() {
    const lead = DEFAULT_DELETE_PREFIX.startsWith("/")
      ? DEFAULT_DELETE_PREFIX
      : "/" + DEFAULT_DELETE_PREFIX;
    const noMulti = lead.replace(/\/{2,}/g, "/");
    return noMulti.endsWith("/") ? noMulti : noMulti + "/";
  }

  _normPreviewPosition(v) {
    const s = String(v || "").toLowerCase().trim();
    return s === "bottom" ? "bottom" : "top";
  }

  _normSourceMode(v) {
    const s = String(v || "").toLowerCase().trim();
    return s === "media" ? "media" : "sensor";
  }

  _normThumbBarPosition(v) {
    const s = String(v || "").toLowerCase().trim();
    if (s === "hidden") return "hidden";
    if (s === "top") return "top";
    return "bottom";
  }

  _normThumbLayout(v) {
    const s = String(v || "").toLowerCase().trim();
    return s === "vertical" ? "vertical" : "horizontal";
  }

  _normalizeLiveCameras(listOrSingle, fallbackSingle = "") {
    const arr = Array.isArray(listOrSingle)
      ? listOrSingle
      : listOrSingle
        ? [listOrSingle]
        : fallbackSingle
          ? [fallbackSingle]
          : [];

    const out = [];
    const seen = new Set();

    for (const raw of arr) {
      const v = String(raw || "").trim();
      if (!v) continue;
      const k = v.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }

    return out;
  }

  _normalizeVisibleObjectFilters(listOrSingle) {
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
      if (!v || !allowed.has(v) || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
      if (out.length >= MAX_VISIBLE_OBJECT_FILTERS) break;
    }

    return out;
  }

  _sensorEntityList() {
    const arr = Array.isArray(this.config?.entities) ? this.config.entities : [];
    const clean = arr.map((x) => String(x || "").trim()).filter(Boolean);
    if (clean.length) return clean;

    const single = String(this.config?.entity || "").trim();
    return single ? [single] : [];
  }

  _sensorNormalizeEntities(listOrSingle, fallbackSingle = "") {
    const arr = Array.isArray(listOrSingle)
      ? listOrSingle
      : listOrSingle
        ? [listOrSingle]
        : fallbackSingle
          ? [fallbackSingle]
          : [];

    const out = [];
    const seen = new Set();

    for (const raw of arr) {
      const v = String(raw ?? "").trim();
      if (!v) continue;
      const k = v.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }

    return out;
  }

  _serviceParts() {
    const full = String(this.config?.delete_service || "");
    const [domain, service] = full.split(".");
    if (!domain || !service) return null;
    return { domain, service };
  }

  // ─── Live helpers ─────────────────────────────────────────────────

  _closeLivePicker() {
    this._showLivePicker = false;
    this.requestUpdate();
  }

  async _ensureLiveCard() {
    const entity = this._getEffectiveLiveCamera();
    if (!entity) {
      this._liveCard = null;
      this._liveCardConfigKey = "";
      return null;
    }

    const cfg = {
      background: false,
      entity,
      mode: "webrtc",
      muted: true,
      type: "custom:webrtc-camera",
      ui: false,
    };

    const key = JSON.stringify(cfg);

    if (this._liveCard && this._liveCardConfigKey === key) {
      this._liveCard.hass = this._hass;
      return this._liveCard;
    }

    const helpers = await window.loadCardHelpers?.();
    if (!helpers) {
      console.warn("[camera-gallery-card] loadCardHelpers unavailable");
      return null;
    }

    const card = await helpers.createCardElement(cfg);
    card.hass = this._hass;

    try {
      card.style.setProperty("display", "block");
      card.style.setProperty("height", "100%");
      card.style.setProperty("width", "100%");
    } catch (_) {}

    this._liveCard = card;
    this._liveCardConfigKey = key;
    return card;
  }

  _getEffectiveLiveCamera() {
    const options = this._getLiveCameraOptions();
    const selected = String(this._liveSelectedCamera || "").trim();
    const preferred = String(this.config?.live_camera_entity || "").trim();

    if (selected && options.includes(selected)) return selected;
    if (preferred && options.includes(preferred)) return preferred;
    return options[0] || "";
  }

  _getLiveCameraOptions() {
    return this._getAllLiveCameraEntities();
  }

  _hideLiveQuickSwitchButton() {
    if (this._liveQuickSwitchTimer) {
      clearTimeout(this._liveQuickSwitchTimer);
      this._liveQuickSwitchTimer = null;
    }
    this._showLiveQuickSwitch = false;
    this.requestUpdate();
  }

  async _mountLiveCard() {
    if (!this._isLiveActive()) return;

    const host = this.renderRoot?.querySelector("#live-card-host");
    if (!host) return;

    const card = await this._ensureLiveCard();
    if (!card) return;

    if (card.parentElement !== host) {
      host.innerHTML = "";
      host.appendChild(card);
    }

    card.hass = this._hass;

    const removeRTC = () => {
      const rtc = card.querySelector?.(".mode, .webrtc-mode");
      if (rtc) rtc.remove();
    };

    removeRTC();

    const obs = new MutationObserver(removeRTC);
    obs.observe(card, { childList: true, subtree: true });
  }

  _openLivePicker() {
    if (this._getLiveCameraOptions().length <= 1) return;
    this._showLivePicker = true;
    this.requestUpdate();
  }

  _renderLiveCardHost() {
    return html`<div id="live-card-host" class="live-card-host"></div>`;
  }

  _renderLiveInner() {
    const entity = this._getEffectiveLiveCamera();
    if (!entity) {
      return html`<div class="preview-empty">No live camera configured.</div>`;
    }

    const st = this._hass?.states?.[entity];
    if (!st) {
      return html`<div class="preview-empty">Camera entity not found: ${entity}</div>`;
    }

    const hasMultipleLiveCameras = this._getLiveCameraOptions().length > 1;

    return html`
      <div class="live-stage">
        ${this._renderLiveCardHost()}

        <div class="live-badge">
          <span class="live-dot"></span>
          <span>LIVE</span>
        </div>

        ${hasMultipleLiveCameras && this._showLiveQuickSwitch
          ? html`
              <button
                class="live-quick-switch"
                title="Choose camera"
                aria-label="Choose camera"
                @click=${(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  this._openLivePicker();
                }}
              >
                <ha-icon icon="mdi:video-switch"></ha-icon>
              </button>
            `
          : html``}

        ${this._renderLivePicker()}
      </div>
    `;
  }

  _renderLivePicker() {
    const cams = this._getLiveCameraOptions();
    if (!cams.length || !this._showLivePicker) return html``;

    const activeCam = this._getEffectiveLiveCamera();

    return html`
      <div
        class="live-picker-backdrop"
        @click=${() => this._closeLivePicker()}
      ></div>

      <div class="live-picker" @click=${(e) => e.stopPropagation()}>
        <div class="live-picker-head">
          <div class="live-picker-title">Select camera</div>
          <button
            class="live-picker-close"
            @click=${() => this._closeLivePicker()}
            title="Close"
            aria-label="Close"
          >
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
        </div>

        <div class="live-picker-list">
          ${cams.map((cam) => {
            const isOn = cam === activeCam;
            return html`
              <button
                class="live-picker-item ${isOn ? "on" : ""}"
                @click=${() => this._selectLiveCamera(cam)}
                title="${this._friendlyCameraName(cam)}"
              >
                <div class="live-picker-item-left">
                  <ha-icon icon="mdi:video"></ha-icon>
                  <span>${this._friendlyCameraName(cam)}</span>
                </div>

                ${isOn
                  ? html`<ha-icon
                      class="live-picker-check"
                      icon="mdi:check"
                    ></ha-icon>`
                  : html``}
              </button>
            `;
          })}
        </div>
      </div>
    `;
  }

  async _selectLiveCamera(entity) {
    const next = String(entity || "").trim();
    if (!next) return;

    this._hideLiveQuickSwitchButton();
    this._liveCard = null;
    this._liveCardConfigKey = "";
    this._liveSelectedCamera = next;
    this._showLivePicker = false;
    this.requestUpdate();

    await this.updateComplete;
    this._mountLiveCard();
  }

  _setViewMode(nextMode) {
    const mode = nextMode === "live" ? "live" : "media";
    if (mode === "live" && !this._hasLiveConfig()) return;

    this._viewMode = mode;
    this._showNav = false;

    if (mode !== "live") {
      this._hideLiveQuickSwitchButton();
      this._showLivePicker = false;
    }

    if (this.config?.preview_click_to_open) {
      this._previewOpen = mode === "live" ? true : !!this._previewOpen;
    }

    this.requestUpdate();
  }

  _showLiveQuickSwitchButton() {
    if (!this._isLiveActive()) return;
    if (this._getLiveCameraOptions().length <= 1) return;

    this._showLiveQuickSwitch = true;
    this.requestUpdate();

    if (this._liveQuickSwitchTimer) {
      clearTimeout(this._liveQuickSwitchTimer);
    }

    this._liveQuickSwitchTimer = setTimeout(() => {
      this._showLiveQuickSwitch = false;
      this.requestUpdate();
    }, 2500);
  }

  _toggleLiveMode() {
    if (!this._hasLiveConfig()) return;

    if (this._isLiveActive()) {
      this._hideLiveQuickSwitchButton();
      this._setViewMode("media");
      this._showLivePicker = false;
      return;
    }

    this._hideLiveQuickSwitchButton();
    this._setViewMode("live");
    this._showLivePicker = false;

    this.requestUpdate();
  }

  // ─── Thumb menu / long press ──────────────────────────────────────

  _clearThumbLongPress() {
    if (this._thumbLongPressTimer) {
      clearTimeout(this._thumbLongPressTimer);
      this._thumbLongPressTimer = null;
    }
  }

  _closeThumbMenu() {
    this._thumbMenuItem = null;
    this._thumbMenuOpen = false;
    this._thumbMenuOpenedAt = 0;
    this.requestUpdate();
  }

  _getThumbActions(item) {
    const actions = [];

    if (this._thumbCanDelete(item)) {
      actions.push({
        danger: true,
        icon: "mdi:trash-can-outline",
        id: "delete",
        label: "Delete",
      });
    }

    if (this._thumbCanMultipleDelete()) {
      actions.push({
        icon: "mdi:select-multiple",
        id: "multiple_delete",
        label: "Multiple delete",
      });
    }

    if (this._thumbCanDownload(item)) {
      actions.push({
        icon: "mdi:download",
        id: "download",
        label: "Download",
      });
    }

    actions.sort((a, b) => a.label.localeCompare(b.label, this._locale()));
    return actions;
  }

  async _handleThumbAction(actionId, item) {
    if (!item?.src) return;

    const usingMediaSource = this.config?.source_mode === "media";
    const isMs = usingMediaSource && this._isMediaSourceId(item.src);

    let url = item.src;
    if (isMs) {
      url = this._ms?.urlCache?.get(item.src) || "";
      if (!url) {
        try {
          url = await this._msResolve(item.src);
        } catch (_) {}
      }
    }

    if (actionId === "delete") {
      this._closeThumbMenu();
      await this._deleteSingle(item.src);
      return;
    }

    if (actionId === "multiple_delete") {
      this._closeThumbMenu();

      this._selectMode = true;
      this._selectedSet?.clear?.();
      this._selectedSet?.add?.(item.src);
      this._showBulkDeleteHint();

      this.requestUpdate();
      return;
    }

    if (actionId === "download") {
      this._closeThumbMenu();
      await this._downloadSrc(url || item.src);
    }
  }

  _isFrigateMediaItem(src) {
    return (
      this._isMediaSourceId(src) &&
      String(src || "").startsWith("media-source://frigate/")
    );
  }

  _onThumbContextMenu(e, item) {
    if (this._selectMode) return;
    if (this._isFrigateMediaItem(item?.src)) return;

    e.preventDefault();
    e.stopPropagation();
    this._clearThumbLongPress();
    this._openThumbMenu(item);
    this._suppressNextThumbClick = true;
  }

  _onThumbPointerCancel() {
    this._clearThumbLongPress();
  }

  _onThumbPointerDown(e, item) {
    if (this._selectMode) return;
    if (!item?.src) return;
    if (e?.button != null && e.button !== 0) return;
    if (this._isFrigateMediaItem(item.src)) return;

    this._thumbLongPressStartX = e.clientX ?? 0;
    this._thumbLongPressStartY = e.clientY ?? 0;

    this._clearThumbLongPress();

    this._thumbLongPressTimer = setTimeout(() => {
      this._thumbLongPressTimer = null;
      this._suppressNextThumbClick = true;
      this._openThumbMenu(item);
    }, THUMB_LONG_PRESS_MS);
  }

  _onThumbPointerMove(e) {
    if (!this._thumbLongPressTimer) return;
    const dx = Math.abs((e.clientX ?? 0) - this._thumbLongPressStartX);
    const dy = Math.abs((e.clientY ?? 0) - this._thumbLongPressStartY);
    if (dx > THUMB_LONG_PRESS_MOVE_PX || dy > THUMB_LONG_PRESS_MOVE_PX) {
      this._clearThumbLongPress();
    }
  }

  _onThumbPointerUp() {
    this._clearThumbLongPress();
  }

  _openThumbMenu(item) {
    if (!item?.src) return;
    this._thumbMenuItem = item;
    this._thumbMenuOpen = true;
    this._thumbMenuOpenedAt = Date.now();
    this.requestUpdate();

    try {
      navigator.vibrate?.(12);
    } catch (_) {}
  }

  _renderThumbActionSheet() {
    if (!this._thumbMenuOpen || !this._thumbMenuItem) return html``;

    const item = this._thumbMenuItem;
    const actions = this._getThumbActions(item);
    const timeLabel = this._tsLabelFromFilename(item.src);

    return html`
      <div
        class="thumb-menu-backdrop"
        @click=${(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!this._thumbMenuCanAcceptTap()) return;
          this._closeThumbMenu();
        }}
      ></div>

      <div
        class="thumb-menu-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Thumbnail acties"
        @click=${(e) => e.stopPropagation()}
      >
        <div class="thumb-menu-handle"></div>

        <div class="thumb-menu-head">
          <div class="thumb-menu-subtitle">${timeLabel || "Media item"}</div>
        </div>

        <div class="thumb-menu-list">
          ${actions.map(
            (action) => html`
              <button
                class="thumb-menu-item ${action.danger ? "danger" : ""}"
                @click=${(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!this._thumbMenuCanAcceptTap()) return;
                  this._handleThumbAction(action.id, item);
                }}
              >
                <div class="thumb-menu-item-left">
                  <ha-icon icon="${action.icon}"></ha-icon>
                  <span>${action.label}</span>
                </div>
                <ha-icon
                  class="thumb-menu-item-arrow"
                  icon="mdi:chevron-right"
                ></ha-icon>
              </button>
            `
          )}
        </div>

        <div class="thumb-menu-footer">
          <button
            class="thumb-menu-cancel"
            @click=${(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!this._thumbMenuCanAcceptTap()) return;
              this._closeThumbMenu();
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    `;
  }

  _thumbCanDelete(item) {
    if (!item?.src) return false;
    if (this.config?.source_mode !== "sensor") return false;
    if (!this.config?.allow_delete) return false;
    return !!this._serviceParts();
  }

  _thumbCanDownload(item) {
    return !!item?.src;
  }

  _thumbMenuCanAcceptTap() {
    return Date.now() - (this._thumbMenuOpenedAt || 0) > 700;
  }

  // ─── Media / delete / download ────────────────────────────────────

  async _deleteSingle(src) {
    if (this.config?.source_mode !== "sensor") return;
    if (!this.config?.allow_delete) return;

    const sp = this._serviceParts();
    if (!sp) return;

    const fsPath = this._toFsPath(src);
    const prefix = this._normPrefixHardcoded();

    if (!fsPath || !fsPath.startsWith(prefix)) return;

    if (this.config?.delete_confirm) {
      const ok = window.confirm("Are you sure you want to delete this file?");
      if (!ok) return;
    }

    try {
      await this._hass.callService(sp.domain, sp.service, { path: fsPath });
      this._deleted.add(src);
      this._selectedSet?.delete?.(src);

      const rawItems = this._items();
      if (!rawItems.length) {
        this._selectedIndex = 0;
      }

      this.requestUpdate();
    } catch (_) {}
  }

  async _downloadSrc(urlOrPath) {
    if (!urlOrPath) return;

    const url = String(urlOrPath);
    const base = url.split("?")[0].split("#")[0];
    const name = (() => {
      try {
        return decodeURIComponent(base.split("/").pop() || "download");
      } catch (_) {
        return base.split("/").pop() || "download";
      }
    })();

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch (_) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  _isMediaSourceId(v) {
    return String(v || "").startsWith("media-source://");
  }

  _isFrigateRoot(root) {
    return String(root || "").includes("media-source://frigate/");
  }

  _hasFrigateSource() {
    const roots =
      Array.isArray(this.config?.media_sources) && this.config.media_sources.length
        ? this.config.media_sources
        : this.config?.media_source
          ? [this.config.media_source]
          : [];

    return roots.some((root) => this._isFrigateRoot(root));
  }

  _getFrigateSnapshotsRoot() {
    return "media-source://frigate/snapshots";
  }

  _isVideo(src) {
    return /\.(mp4|webm|mov|m4v)$/i.test(String(src || ""));
  }

  _toFsPath(src) {
    if (!src) return "";
    let clean = String(src).trim();
    clean = clean.split("?")[0].split("#")[0];
    try {
      if (clean.startsWith("http://") || clean.startsWith("https://")) {
        clean = new URL(clean).pathname;
      }
    } catch (_) {}
    try {
      clean = decodeURIComponent(clean);
    } catch (_) {}
    if (clean.startsWith("/local/")) {
      return "/config/www/" + clean.slice("/local/".length);
    }
    if (clean.startsWith("/config/www/")) return clean;
    return "";
  }

  _getFilterAliases(filter) {
    const f = String(filter || "").toLowerCase().trim();
    if (!f) return [];

    const map = {
      person: ["person", "persoon", "personen"],
      visitor: ["visitor", "visitors", "bezoeker", "bezoekers", "bezoek"],
      dog: ["dog", "hond", "honden"],
      cat: ["cat", "kat", "katten"],
      car: ["car", "auto", "autos", "voertuig", "vehicle"],
      truck: ["truck", "vrachtwagen"],
      bicycle: ["bicycle", "fiets", "fietser", "bike"],
      motorcycle: ["motorcycle", "motor", "motorbike"],
      bird: ["bird", "vogel", "vogels"],
      bus: ["bus"],
    };

    return map[f] || [f];
  }

  _itemFilenameForFilter(itemOrSrc) {
    if (!itemOrSrc) return "";

    if (typeof itemOrSrc === "string") {
      return String(itemOrSrc).toLowerCase();
    }

    return String(
      itemOrSrc.filename ||
      itemOrSrc.name ||
      itemOrSrc.basename ||
      itemOrSrc.path ||
      itemOrSrc.file ||
      itemOrSrc.fullpath ||
      itemOrSrc.src ||
      ""
    ).toLowerCase();
  }

  _sensorTextForFilter(sensorEntityId, sensorStateObj = null) {
    const entityId = String(sensorEntityId || "").toLowerCase();
    const friendly = String(
      sensorStateObj?.attributes?.friendly_name ||
      sensorStateObj?.attributes?.name ||
      ""
    ).toLowerCase();

    return `${entityId} ${friendly}`.trim();
  }

  _matchesObjectFilterForFileSensor(
    srcOrItem,
    filter,
    sensorEntityId,
    sensorStateObj = null
  ) {
    const aliases = this._getFilterAliases(filter);
    if (!aliases.length) return true;

    const sensorText = this._sensorTextForFilter(
      sensorEntityId,
      sensorStateObj
    );
    const fileText = this._itemFilenameForFilter(srcOrItem);

    return aliases.some((alias) => {
      const a = String(alias || "").toLowerCase().trim();
      if (!a) return false;

      return sensorText.includes(a) || fileText.includes(a);
    });
  }

  _findMatchingSnapshotMediaId(videoId) {
    const src = String(videoId || "").trim();
    if (!src) return "";

    if (this._snapshotCache.has(src)) {
      return this._snapshotCache.get(src);
    }

    if (!src.includes("/clips/")) {
      this._snapshotCache.set(src, "");
      return "";
    }

    const snapshotId = src.replace("/clips/", "/snapshots/");

    this._snapshotCache.set(src, snapshotId);
    return snapshotId;
  }

  async _getSnapshotUrlForVideo(videoId) {
    const snapshotId = this._findMatchingSnapshotMediaId(videoId);
    if (!snapshotId) return "";

    const cached = this._ms?.urlCache?.get(snapshotId);
    if (cached) return cached;

    try {
      return await this._msResolve(snapshotId);
    } catch (_) {
      return "";
    }
  }

  _queueSnapshotResolveForVisibleThumbs(items) {
    if (!Array.isArray(items) || !items.length) return;
    if (!this._hasFrigateSource()) return;

    const snapshotIds = [];

    for (const it of items) {
      const src = String(it?.src || "");
      if (!src || !this._isMediaSourceId(src)) continue;

      const snapshotId = this._findMatchingSnapshotMediaId(src);
      if (snapshotId) snapshotIds.push(snapshotId);
    }

    if (snapshotIds.length) {
      this._msQueueResolve(snapshotIds);
    }
  }

  _toWebPath(p) {
    if (!p) return "";
    const v = String(p).trim();
    if (v.startsWith("/config/www/")) {
      return "/local/" + v.slice("/config/www/".length);
    }
    if (v === "/config/www") return "/local";
    return v;
  }

  // ─── Poster helpers ───────────────────────────────────────────────

  _captureFirstFrame(src) {
    return new Promise((resolve, reject) => {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "metadata";
      v.controls = false;

      const cleanup = () => {
        try {
          v.pause();
        } catch (_) {}
        v.removeAttribute("src");
        try {
          v.load();
        } catch (_) {}
      };

      const fail = (err) => {
        cleanup();
        reject(err ?? new Error("poster fail"));
      };

      const draw = () => {
        try {
          const w = v.videoWidth || 0;
          const h = v.videoHeight || 0;
          if (!w || !h) return fail(new Error("no video dimensions"));
          const maxW = 320;
          const scale = Math.min(1, maxW / w);
          const tw = Math.max(1, Math.round(w * scale));
          const th = Math.max(1, Math.round(h * scale));

          const c = document.createElement("canvas");
          c.width = tw;
          c.height = th;

          const ctx = c.getContext("2d");
          ctx.drawImage(v, 0, 0, tw, th);

          cleanup();
          resolve(c.toDataURL("image/jpeg", 0.6));
        } catch (e) {
          fail(e);
        }
      };

      v.addEventListener(
        "error",
        () => fail(new Error("video load error")),
        { once: true }
      );
      v.addEventListener(
        "loadedmetadata",
        () => {
          try {
            v.currentTime = 0.01;
          } catch (_) {
            draw();
          }
        },
        { once: true }
      );
      v.addEventListener("seeked", () => draw(), { once: true });

      v.src = src;
      try {
        v.load();
      } catch (_) {}
    });
  }

  async _ensurePoster(src) {
    if (!src || this._posterCache.has(src) || this._posterPending.has(src)) {
      return;
    }
    this._posterPending.add(src);
    try {
      const dataUrl = await this._captureFirstFrame(src);
      if (dataUrl) this._posterCache.set(src, dataUrl);
    } catch (_) {
    } finally {
      this._posterPending.delete(src);
      this.requestUpdate();
    }
  }

  // ─── Media source ─────────────────────────────────────────────────

  async _msBrowse(rootId) {
    return await this._wsWithTimeout({
      type: "media_source/browse_media",
      media_content_id: rootId,
    });
  }

  async _msEnsureLoaded() {
    const roots =
      Array.isArray(this.config?.media_sources) &&
      this.config.media_sources.length
        ? this._msNormalizeRoots(this.config.media_sources)
        : this._msNormalizeRoots(this.config?.media_source);

    if (!roots.length) return;

    const now = Date.now();
    const key = this._msKeyFromRoots(roots);
    const sameKey = this._ms.key === key;
    const fresh = sameKey && now - (this._ms.loadedAt || 0) < 60_000;

    if (this._ms.loading || fresh) return;

    if (!sameKey) {
      this._ms.key = key;
      this._ms.list = [];
      this._ms.roots = roots.slice();
      this._ms.urlCache = new Map();
    }

    this._ms.loading = true;

    try {
      const visibleCap = this._normMaxMedia(this.config?.max_media);
      const isFrigateRoot = roots.some((r) =>
        String(r).includes("media-source://frigate/")
      );

      const internalCap = isFrigateRoot
        ? Math.min(120, Math.max(visibleCap * 2, 40))
        : Math.min(300, Math.max(visibleCap * 4, 80));

      const walkLimitTotal = isFrigateRoot
        ? Math.min(240, Math.max(internalCap * 2, internalCap + 20))
        : Math.min(600, Math.max(internalCap * 3, internalCap + 40));
      const perRootLimit = Math.max(
        DEFAULT_PER_ROOT_MIN_LIMIT,
        Math.ceil(walkLimitTotal / roots.length)
      );

      const flat = [];

      for (const root of roots) {
        try {
          const rootStr = String(root);
          const isLocalRoot = rootStr.includes("media_source/local/");
          const isFrigateRoot = rootStr.includes("media-source://frigate/");

          const depthLimit = isFrigateRoot
            ? 3
            : isLocalRoot
              ? Math.min(6, DEFAULT_WALK_DEPTH)
              : DEFAULT_WALK_DEPTH;

          const tmp = await this._msWalkIter(root, perRootLimit, depthLimit);
          flat.push(...tmp);
        } catch (e) {
          console.warn("MS root failed:", root, e);
        }
      }

      if (roots.some((r) => this._isFrigateRoot(r))) {
        try {
          const snapshotRoot = this._getFrigateSnapshotsRoot();
          const snapshotItems = await this._msWalkIter(
            snapshotRoot,
            Math.min(400, Math.max(visibleCap * 6, 120)),
            3
          );

          this._frigateSnapshots = snapshotItems
            .filter((x) => !!x?.media_content_id)
            .map((x) => ({
              id: String(x.media_content_id || ""),
              title: String(x.title || ""),
              mime: String(x.mime_type || ""),
              cls: String(x.media_class || ""),
              dtMs: this._dtMsFromSrc(String(x.title || x.media_content_id || "")),
              dayKey: this._extractDayKey(String(x.title || x.media_content_id || "")),
            }))
            .filter((x) => !!x.id);
        } catch (e) {
          console.warn("Frigate snapshots load failed:", e);
          this._frigateSnapshots = [];
        }
      } else {
        this._frigateSnapshots = [];
      }

      let items = flat
        .filter((x) => !!x?.media_content_id)
        .map((x) => ({
          cls: String(x.media_class || ""),
          id: String(x.media_content_id || ""),
          mime: String(x.mime_type || ""),
          title: String(x.title || ""),
        }))
        .filter((x) => !!x.id);

      items = this._dedupeByRelPath(items);

      items.sort((a, b) => {
        const am = this._dtMsFromSrc(a.id);
        const bm = this._dtMsFromSrc(b.id);
        const aOk = Number.isFinite(am);
        const bOk = Number.isFinite(bm);
        if (aOk && bOk && bm !== am) return bm - am;
        if (aOk && !bOk) return -1;
        if (!aOk && bOk) return 1;
        return a.title < b.title ? 1 : a.title > b.title ? -1 : 0;
      });

      this._ms.list = items.slice(0, internalCap);
      this._ms.loadedAt = Date.now();
    } catch (e) {
      console.warn("MS ensure load failed:", e);
      console.warn("MS roots used:", roots);
      this._ms.list = [];
    } finally {
      this._ms.loading = false;
      this.requestUpdate();
    }
  }

  _msIds() {
    return Array.isArray(this._ms?.list) ? this._ms.list.map((x) => x.id) : [];
  }

  _msIsRenderable(mime, mediaClass, title) {
    const t = String(title || "").toLowerCase();
    const m = String(mime || "").toLowerCase();
    const c = String(mediaClass || "").toLowerCase();

    if (m.startsWith("image/")) return true;
    if (m.startsWith("video/")) return true;
    if (/\.(jpg|jpeg|png|webp|gif)$/i.test(t)) return true;
    if (/\.(mp4|webm|mov|m4v)$/i.test(t)) return true;
    if (c === "image" || c === "video") return true;

    return false;
  }

  _msKeyFromRoots(rootsArr, fallbackSingle) {
    const roots =
      Array.isArray(rootsArr) && rootsArr.length
        ? this._msNormalizeRoots(rootsArr)
        : this._msNormalizeRoots(fallbackSingle);

    if (!roots.length) return "";
    return roots
      .slice()
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .join(" | ");
  }

  _msMetaById(id) {
    const it = (this._ms?.list || []).find((x) => x.id === id);
    if (!it) return { cls: "", mime: "", title: "" };
    return { cls: it.cls || "", mime: it.mime || "", title: it.title || "" };
  }

  _msNormalizeRoot(raw) {
    let v = String(raw || "").trim();
    if (!v) return "";

    const strip = (s) =>
      String(s || "").replace(/^\/+/, "").replace(/\/+$/, "");

    if (v.startsWith("media-source://")) {
      let rest = v
        .slice("media-source://".length)
        .replace(/\/{2,}/g, "/")
        .replace(/\/+$/g, "");
      if (rest.startsWith("local/")) rest = `media_source/${rest}`;
      return `media-source://${rest}`;
    }

    v = strip(v);

    if (/^frigate(\/|$)/i.test(v)) {
      const rest = strip(v.replace(/^frigate/i, ""));
      return rest ? `media-source://frigate/${rest}` : `media-source://frigate`;
    }

    v = v.replace(/^media\//, "");
    return `media-source://media_source/${v}`;
  }

  _msNormalizeRoots(listOrSingle) {
    const arr = Array.isArray(listOrSingle)
      ? listOrSingle
      : listOrSingle
        ? [listOrSingle]
        : [];

    const out = [];
    const seen = new Set();

    for (const raw of arr) {
      const n = this._msNormalizeRoot(raw);
      if (!n) continue;
      const k = String(n).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(n);
    }

    return out;
  }

  _msQueueResolve(ids) {
    for (const id of ids || []) {
      if (!id || this._ms.urlCache.has(id)) continue;
      this._msResolveQueued.add(id);
    }
    if (this._msResolveInFlight) return;

    this._msResolveInFlight = true;

    (async () => {
      try {
        while (this._msResolveQueued.size) {
          const chunk = Array.from(this._msResolveQueued).slice(
            0,
            DEFAULT_RESOLVE_BATCH
          );
          chunk.forEach((x) => this._msResolveQueued.delete(x));

          await Promise.allSettled(chunk.map((id) => this._msResolve(id)));
          this.requestUpdate();
        }
      } finally {
        this._msResolveInFlight = false;
      }
    })().catch(() => {
      this._msResolveInFlight = false;
    });
  }

  async _msResolve(mediaId) {
    const cached = this._ms?.urlCache?.get(mediaId);
    if (cached) return cached;

    const r = await this._wsWithTimeout(
      {
        type: "media_source/resolve_media",
        media_content_id: mediaId,
        expires: 60 * 60,
      },
      12000
    );

    const url = r?.url ? String(r.url) : "";
    if (url) this._ms.urlCache.set(mediaId, url);
    return url;
  }

  _msTitleById(id) {
    const it = (this._ms?.list || []).find((x) => x.id === id);
    return it?.title || "";
  }

  async _msWalkIter(rootId, limit, depthLimit) {
    const out = [];
    const stack = [{ depth: 0, id: rootId }];

    while (stack.length && out.length < limit) {
      const { depth, id } = stack.pop();
      if (!id || depth > depthLimit) continue;

      let node;
      try {
        node = await this._msBrowse(id);
      } catch (_) {
        continue;
      }

      const children = Array.isArray(node?.children) ? node.children : [];

      if (!children.length) {
        if (node?.media_content_id) {
          const ok = this._msIsRenderable(
            node?.mime_type,
            node?.media_class,
            node?.title
          );
          if (ok) out.push(node);
        }
        continue;
      }

      for (let i = children.length - 1; i >= 0; i--) {
        if (out.length >= limit) break;

        const ch = children[i];
        const mid = String(ch?.media_content_id || "");
        if (!mid) continue;

        const cls = String(ch?.media_class || "").toLowerCase();
        if (cls === "directory") {
          stack.push({ depth: depth + 1, id: mid });
        } else {
          const ok = this._msIsRenderable(
            ch?.mime_type,
            ch?.media_class,
            ch?.title
          );
          if (ok) out.push(ch);
        }
      }
    }

    return out;
  }

  _wsWithTimeout(payload, timeoutMs = DEFAULT_BROWSE_TIMEOUT_MS) {
    const p = this._hass.callWS(payload);
    const t = new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`WS timeout: ${payload?.type}`)), timeoutMs)
    );
    return Promise.race([p, t]);
  }

  // ─── Data / time parsing ──────────────────────────────────────────

  _dayKeyFromMs(ms) {
    if (!Number.isFinite(ms)) return null;
    try {
      const d = new Date(ms);
      const y = String(d.getFullYear()).padStart(4, "0");
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    } catch (_) {
      return null;
    }
  }

  _dedupeByRelPath(items) {
    const seen = new Map();

    const norm = (idOrPath) =>
      String(idOrPath || "")
        .replace(/^media-source:\/\/media_source\//, "")
        .replace(/^media-source:\/\/media_source/, "")
        .replace(/^media-source:\/\//, "")
        .replace(/\/{2,}/g, "/")
        .replace(/^\/+/, "")
        .replace(/\/+$/g, "")
        .trim()
        .toLowerCase();

    for (const it of items || []) {
      const key = norm(it?.media_content_id || it?.path || it?.id || it);
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, it);
    }

    return Array.from(seen.values());
  }

  _dtKeyFromMs(ms) {
    if (!Number.isFinite(ms)) return null;
    try {
      const d = new Date(ms);
      const y = String(d.getFullYear()).padStart(4, "0");
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      return `${y}-${m}-${dd}T${hh}:${mm}:${ss}`;
    } catch (_) {
      return null;
    }
  }

  _dtMsFromSrc(src) {
    const custom = this._parseDateFromFilename(
      src,
      this.config?.filename_datetime_format
    );
    if (custom?.ms != null) return custom.ms;

    const ems = this._extractEpochMs(src);
    if (Number.isFinite(ems)) return ems;

    const ymd = this._extractYmdHms(src);
    if (ymd?.dtKey) {
      const ms = new Date(ymd.dtKey).getTime();
      if (Number.isFinite(ms)) return ms;
    }

    const dtKey = (() => {
      const s = this._sourceNameForParsing(src);
      const m = String(s || "").match(/(\d{8})[_-](\d{6})/);
      if (!m) return null;
      return `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(
        6,
        8
      )}T${m[2].slice(0, 2)}:${m[2].slice(2, 4)}:${m[2].slice(4, 6)}`;
    })();

    if (dtKey) {
      const ms = new Date(dtKey).getTime();
      if (Number.isFinite(ms)) return ms;
    }

    const dayKey = (() => {
      const s = this._sourceNameForParsing(src);
      const m = String(s || "").match(/(\d{8})/);
      if (!m) return null;
      return `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`;
    })();

    if (dayKey) {
      const ms = new Date(`${dayKey}T00:00:00`).getTime();
      if (Number.isFinite(ms)) return ms;
    }

    return NaN;
  }

  _extractDateTimeKey(src) {
    const custom = this._parseDateFromFilename(
      src,
      this.config?.filename_datetime_format
    );
    if (custom?.dtKey) return custom.dtKey;

    const ymd = this._extractYmdHms(src);
    if (ymd?.dtKey) return ymd.dtKey;

    const ms = this._dtMsFromSrc(src);
    const dt = this._dtKeyFromMs(ms);
    if (dt) return dt;

    const s = this._sourceNameForParsing(src);
    const m = String(s || "").match(/(\d{8})[_-](\d{6})/);
    if (!m) return null;
    return `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(
      6,
      8
    )}T${m[2].slice(0, 2)}:${m[2].slice(2, 4)}:${m[2].slice(4, 6)}`;
  }

  _extractDayKey(src) {
    const custom = this._parseDateFromFilename(
      src,
      this.config?.filename_datetime_format
    );
    if (custom?.dayKey) return custom.dayKey;

    const ymd = this._extractYmdHms(src);
    if (ymd?.dayKey) return ymd.dayKey;

    const ms = this._dtMsFromSrc(src);
    const dk = this._dayKeyFromMs(ms);
    if (dk) return dk;

    const s = this._sourceNameForParsing(src);
    const m = String(s).match(/(\d{8})/);
    if (!m) return null;
    return `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`;
  }

  _extractEpochMs(src) {
    const s = this._sourceNameForParsing(src);
    if (!s) return NaN;

    let m = String(s).match(/-(\d{9,11}(?:\.\d+)?)-/);
    if (!m) m = String(s).match(/(\d{9,11}(?:\.\d+)?)/);
    if (!m) return NaN;

    const sec = Number.parseFloat(m[1]);
    if (!Number.isFinite(sec)) return NaN;

    if (sec < 946684800 || sec > 4102444800) return NaN;

    return sec * 1000;
  }

  _extractYmdHms(src) {
    const s = this._sourceNameForParsing(src);
    if (!s) return null;

    const m = String(s).match(
      /(\d{4})-(\d{2})-(\d{2})[T _-]?(\d{2})[:\-\.](\d{2})[:\-\.](\d{2})/
    );
    if (!m) return null;

    const y = m[1];
    const mo = m[2];
    const d = m[3];
    const hh = m[4];
    const mm = m[5];
    const ss = m[6];

    return {
      dayKey: `${y}-${mo}-${d}`,
      dtKey: `${y}-${mo}-${d}T${hh}:${mm}:${ss}`,
    };
  }

  _formatDateTime(dtKey) {
    if (!dtKey) return "";
    try {
      const dt = new Date(dtKey);
      const locale = this._locale();

      const date = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(dt);

      const time = new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(dt);

      return `${date} • ${time}`;
    } catch (_) {
      return "";
    }
  }

  _formatDay(dayKey) {
    if (!dayKey) return "";
    try {
      return new Intl.DateTimeFormat(this._locale(), {
        day: "numeric",
        month: "long",
      }).format(new Date(`${dayKey}T00:00:00`));
    } catch (_) {
      return dayKey;
    }
  }

  _formatTimeFromMs(ms) {
    if (!Number.isFinite(ms)) return "";
    try {
      return new Intl.DateTimeFormat(this._locale(), {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(ms));
    } catch (_) {
      return "";
    }
  }

  _items() {
    const usingMediaSource = this.config?.source_mode === "media";

    if (usingMediaSource) {
      let ids = this._msIds();
      ids = this._dedupeByRelPath(ids);

      if (this._deleted?.size) {
        return ids.filter((id) => !this._deleted.has(id));
      }
      return ids;
    }

    const entities = this._sensorEntityList();
    if (!entities.length) return [];

    let list = [];
    this._srcEntityMap = new Map();

    for (const entityId of entities) {
      const st = this._hass?.states?.[entityId];
      const raw = st?.attributes?.[ATTR_NAME];
      if (!raw) continue;

      let part = [];

      if (Array.isArray(raw)) {
        part = raw.map((x) => this._toWebPath(x)).filter(Boolean);
      } else if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            part = parsed.map((x) => this._toWebPath(x)).filter(Boolean);
          } else {
            part = [this._toWebPath(raw)].filter(Boolean);
          }
        } catch (_) {
          part = [this._toWebPath(raw)].filter(Boolean);
        }
      }

      for (const src of part) {
        if (!this._srcEntityMap.has(src)) {
          this._srcEntityMap.set(src, entityId);
        }
      }

      list.push(...part);
    }

    list = this._dedupeByRelPath(list);

    if (this._deleted?.size) {
      list = list.filter((src) => !this._deleted.has(src));
    }

    return list;
  }

  _isVideoSmart(urlOrTitle, mime, cls) {
    const m = String(mime || "").toLowerCase();
    const c = String(cls || "").toLowerCase();
    if (m.startsWith("video/")) return true;
    if (c === "video") return true;
    return this._isVideo(urlOrTitle);
  }

  _resetThumbScrollToStart() {
    requestAnimationFrame(() => {
      const wrap = this.renderRoot?.querySelector(".tthumbs");
      if (!wrap) return;

      if (this._isThumbLayoutVertical()) {
        wrap.scrollTop = 0;
        try {
          wrap.scrollTo({ behavior: "auto", top: 0 });
        } catch (_) {}
        return;
      }

      wrap.scrollLeft = 0;
      try {
        wrap.scrollTo({ behavior: "auto", left: 0 });
      } catch (_) {}
    });
  }

  _scrollThumbIntoView(filteredIndexI) {
    return (async () => {
      try {
        await this.updateComplete;
      } catch (_) {}

      await new Promise((resolve) => requestAnimationFrame(() => resolve()));

      const wrap = this.renderRoot?.querySelector(".tthumbs");
      if (!wrap) return;

      const btn = wrap.querySelector(`button.tthumb[data-i="${filteredIndexI}"]`);
      if (!btn) return;

      if (this._isThumbLayoutVertical()) {
        const wrapRect = wrap.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();

        const currentScroll = wrap.scrollTop;
        const btnCenterInScrollSpace =
          currentScroll + (btnRect.top - wrapRect.top) + btnRect.height / 2;

        const target = btnCenterInScrollSpace - wrap.clientHeight / 2;
        const max = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
        const clamped = Math.max(0, Math.min(max, target));

        try {
          wrap.scrollTo({
            behavior: "smooth",
            top: clamped,
          });
        } catch (_) {
          wrap.scrollTop = clamped;
        }
        return;
      }

      const wrapRect = wrap.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();

      const currentScroll = wrap.scrollLeft;
      const btnCenterInScrollSpace =
        currentScroll + (btnRect.left - wrapRect.left) + btnRect.width / 2;

      const target = btnCenterInScrollSpace - wrap.clientWidth / 2;
      const max = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
      const clamped = Math.max(0, Math.min(max, target));

      try {
        wrap.scrollTo({
          behavior: "smooth",
          left: clamped,
        });
      } catch (_) {
        wrap.scrollLeft = clamped;
      }
    })();
  }

  _sourceNameForParsing(src) {
    if (!this._isMediaSourceId(src)) return String(src || "");
    const t = this._msTitleById(src);
    return t || String(src || "");
  }

  _stepDay(delta, days, activeDay) {
    if (!days?.length) return;
    const current = activeDay && days.includes(activeDay) ? activeDay : days[0];
    const i = days.indexOf(current);
    const next = days[Math.min(Math.max(i + delta, 0), days.length - 1)];

    this._selectedDay = next;
    this._selectedIndex = 0;
    this._pendingScrollToI = null;
    this._forceThumbReset = true;
    this._exitSelectMode();

    if (this.config?.preview_click_to_open) this._previewOpen = false;
    if (this._isLiveActive()) this._setViewMode("media");

    this.requestUpdate();
  }

  _tsLabelFromFilename(src) {
    const name = this._sourceNameForParsing(src);
    if (!name) return "";

    const ms = this._dtMsFromSrc(src);
    if (Number.isFinite(ms)) {
      const dtKey = this._dtKeyFromMs(ms);
      const nice = this._formatDateTime(dtKey);
      if (nice) return nice;
    }

    const dayKey = this._extractDayKey(src);
    if (dayKey) {
      try {
        return new Intl.DateTimeFormat(this._locale(), {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(new Date(`${dayKey}T00:00:00`));
      } catch (_) {
        return dayKey;
      }
    }

    const base = String(name).split("/").pop() || String(name);
    const noExt = base.replace(
      /\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)$/i,
      ""
    );
    return noExt.length > 42 ? `${noExt.slice(0, 39)}…` : noExt;
  }

  _uniqueDays(itemsWithDay) {
    const set = new Set();
    for (const it of itemsWithDay) {
      if (it.dayKey) set.add(it.dayKey);
    }
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }

  // ─── Object filters ───────────────────────────────────────────────

  _activeObjectFilters() {
    return Array.isArray(this._objectFilters)
      ? this._objectFilters
          .map((x) => String(x || "").toLowerCase().trim())
          .filter(Boolean)
      : [];
  }

  _detectObjectFromText(text) {
    const raw = String(text || "").toLowerCase().trim();
    if (!raw) return null;

    const s = raw.replace(/[_./\\-]+/g, " ");

    const hasWord = (word) =>
      new RegExp(`(^|\\s)${word}(?=\\s|$)`, "i").test(s);

    if (hasWord("person") || hasWord("persoon") || hasWord("personen")) {
      return "person";
    }

    if (hasWord("visitor") || hasWord("bezoeker") || hasWord("bezoek")) {
      return "visitor";
    }

    if (hasWord("cat") || hasWord("kat")) return "cat";
    if (hasWord("dog") || hasWord("hond")) return "dog";
    if (hasWord("car") || hasWord("auto")) return "car";
    if (hasWord("truck")) return "truck";
    if (hasWord("bus")) return "bus";

    if (hasWord("bicycle") || hasWord("bike") || hasWord("fiets")) {
      return "bicycle";
    }

    if (hasWord("motorcycle") || hasWord("motorbike") || hasWord("motor")) {
      return "motorcycle";
    }

    if (hasWord("bird") || hasWord("vogel")) return "bird";

    return null;
  }

  _filterLabel(v) {
    const s = String(v || "").toLowerCase();
    if (s === "bicycle") return "bicycle";
    if (s === "bird") return "bird";
    if (s === "bus") return "bus";
    if (s === "car") return "car";
    if (s === "cat") return "cat";
    if (s === "dog") return "dog";
    if (s === "motorcycle") return "motorcycle";
    if (s === "person") return "person";
    if (s === "truck") return "truck";
    if (s === "visitor") return "visitor";
    return "selected";
  }

  _filterLabelList(values) {
    const arr = Array.isArray(values)
      ? values
          .map((x) => String(x || "").toLowerCase().trim())
          .filter(Boolean)
      : [];

    if (!arr.length) return "selected";
    return arr.map((v) => this._filterLabel(v)).join(", ");
  }

  _isObjectFilterActive(value) {
    const v = String(value || "").toLowerCase().trim();
    return this._activeObjectFilters().includes(v);
  }

  _matchesObjectFilter(src) {
    return this._matchesObjectFilterValue(src, this._objectFilters);
  }

  _matchesObjectFilterValue(src, filterValues) {
    const active = Array.isArray(filterValues)
      ? filterValues
          .map((x) => String(x || "").toLowerCase().trim())
          .filter(Boolean)
      : [];

    if (!active.length) return true;

    if (this.config?.source_mode === "sensor") {
      const sourceEntity = this._srcEntityMap?.get(src) || "";
      const sensorStateObj = sourceEntity
        ? this._hass?.states?.[sourceEntity]
        : null;

      return active.some((filter) =>
        this._matchesObjectFilterForFileSensor(
          src,
          filter,
          sourceEntity,
          sensorStateObj
        )
      );
    }

    const obj = this._objectForSrc(src);
    return !!obj && active.includes(obj);
  }

  _objectColor() {
    return "rgba(255,255,255,0.92)";
  }

  _objectForSrc(src) {
    const key = String(src || "").trim();
    if (!key) return null;

    if (this._objectCache.has(key)) {
      return this._objectCache.get(key);
    }

    let detected = null;

    if (this.config?.source_mode === "sensor") {
      const sourceEntity = this._srcEntityMap?.get(src) || "";
      const sensorStateObj = sourceEntity
        ? this._hass?.states?.[sourceEntity]
        : null;

      const sourceText = [
        this._itemFilenameForFilter(src),
        this._sensorTextForFilter(sourceEntity, sensorStateObj),
      ]
        .filter(Boolean)
        .join(" ");

      const objects = [
        "person",
        "visitor",
        "dog",
        "cat",
        "car",
        "truck",
        "bicycle",
        "motorcycle",
        "bird",
        "bus",
      ];

      for (const obj of objects) {
        const aliases = this._getFilterAliases(obj);
        if (
          aliases.some((alias) =>
            sourceText.includes(String(alias || "").toLowerCase().trim())
          )
        ) {
          detected = obj;
          break;
        }
      }
    } else if (this.config?.source_mode === "media" && this._isMediaSourceId(src)) {
      const meta = this._msMetaById(src);
      const sourceText = [
        String(meta?.title || "").toLowerCase(),
        String(src || "").toLowerCase(),
      ]
        .filter(Boolean)
        .join(" ");

      const objects = [
        "person",
        "visitor",
        "dog",
        "cat",
        "car",
        "truck",
        "bicycle",
        "motorcycle",
        "bird",
        "bus",
      ];

      for (const obj of objects) {
        const aliases = this._getFilterAliases(obj);
        if (
          aliases.some((alias) =>
            sourceText.includes(String(alias || "").toLowerCase().trim())
          )
        ) {
          detected = obj;
          break;
        }
      }
    } else {
      const sourceText = String(src || "").toLowerCase();

      const objects = [
        "person",
        "visitor",
        "dog",
        "cat",
        "car",
        "truck",
        "bicycle",
        "motorcycle",
        "bird",
        "bus",
      ];

      for (const obj of objects) {
        const aliases = this._getFilterAliases(obj);
        if (
          aliases.some((alias) =>
            sourceText.includes(String(alias || "").toLowerCase().trim())
          )
        ) {
          detected = obj;
          break;
        }
      }
    }

    this._objectCache.set(key, detected);
    return detected;
  }

  _objectIcon(obj) {
    if (!obj) return "";
    if (obj === "bicycle") return "mdi:bicycle";
    if (obj === "bird") return "mdi:bird";
    if (obj === "bus") return "mdi:bus";
    if (obj === "car") return "mdi:car";
    if (obj === "cat") return "mdi:cat";
    if (obj === "dog") return "mdi:dog";
    if (obj === "motorcycle") return "mdi:motorbike";
    if (obj === "person") return "mdi:account";
    if (obj === "truck") return "mdi:truck";
    if (obj === "visitor") return "mdi:doorbell-video";
    return "";
  }

  _setObjectFilter(next) {
    const clicked = String(next || "").toLowerCase().trim();
    if (!clicked) return;

    const visible = new Set(this._getVisibleObjectFilters());
    if (!visible.has(clicked)) return;

    const currentFilters = this._activeObjectFilters().filter((x) =>
      visible.has(x)
    );
    const set = new Set(currentFilters);

    if (set.has(clicked)) set.delete(clicked);
    else set.add(clicked);

    const nextFilters = Array.from(set);

    const rawItems = this._items();
    const withDt = rawItems.map((src, idx) => {
      const dtMs = this._dtMsFromSrc(src);
      const dayKey = this._extractDayKey(src);
      return { dayKey, dtMs, idx, src };
    });

    withDt.sort((a, b) => {
      const aOk = Number.isFinite(a.dtMs);
      const bOk = Number.isFinite(b.dtMs);
      if (aOk && bOk && b.dtMs !== a.dtMs) return b.dtMs - a.dtMs;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return b.idx - a.idx;
    });

    const allWithDay = withDt.map((x) => ({ dayKey: x.dayKey, src: x.src }));
    const days = this._uniqueDays(allWithDay);
    const newestDay = days[0] ?? null;
    const activeDay = this._selectedDay ?? newestDay;

    const dayFiltered = !activeDay
      ? allWithDay
      : allWithDay.filter((x) => x.dayKey === activeDay);

    const currentFiltered = dayFiltered.filter((x) =>
      this._matchesObjectFilterValue(x.src, currentFilters)
    );

    const currentIdx = Math.min(
      Math.max(this._selectedIndex ?? 0, 0),
      Math.max(0, currentFiltered.length - 1)
    );

    const currentSelectedSrc =
      currentFiltered.length > 0 ? currentFiltered[currentIdx]?.src : "";

    const nextFiltered = dayFiltered.filter((x) =>
      this._matchesObjectFilterValue(x.src, nextFilters)
    );

    let nextIndex = 0;

    if (currentSelectedSrc) {
      const keepIdx = nextFiltered.findIndex(
        (x) => x.src === currentSelectedSrc
      );
      if (keepIdx >= 0) nextIndex = keepIdx;
    }

    this._objectFilters = nextFilters;
    this._selectedIndex = nextIndex;
    this._pendingScrollToI = null;
    this._forceThumbReset = true;

    if (this._isLiveActive()) {
      this._setViewMode("media");
    }

    this.requestUpdate();
  }

  // ─── Selection / bulk delete ──────────────────────────────────────

  async _bulkDelete(selectedSrcList) {
    if (this.config?.source_mode !== "sensor") return;
    if (!this.config?.allow_delete || !this.config?.allow_bulk_delete) return;

    const sp = this._serviceParts();
    if (!sp) return;

    const prefix = this._normPrefixHardcoded();
    const srcs = Array.from(selectedSrcList || []);
    if (!srcs.length) return;

    if (this.config?.delete_confirm) {
      const ok = window.confirm(
        `Are you sure you want to delete ${srcs.length} file(s)?`
      );
      if (!ok) return;
    }

    for (const src of srcs) {
      const fsPath = this._toFsPath(src);
      if (!fsPath || !fsPath.startsWith(prefix)) continue;

      try {
        await this._hass.callService(sp.domain, sp.service, { path: fsPath });
        this._deleted.add(src);
      } catch (_) {}
    }

    this._selectedSet.clear();
    this._selectMode = false;
    this._hideBulkDeleteHint();
    this.requestUpdate();
  }

  _exitSelectMode() {
    this._selectMode = false;
    this._selectedSet.clear();
    this._hideBulkDeleteHint();
    this.requestUpdate();
  }

  _toggleSelected(src) {
    if (!src) return;
    if (this._selectedSet.has(src)) this._selectedSet.delete(src);
    else this._selectedSet.add(src);
    this.requestUpdate();
  }

  // ─── Preview interactions ─────────────────────────────────────────

  _closePreviewIfEnabled(e) {
    if (!this.config?.preview_click_to_open) return;
    if (!this.config?.preview_close_on_tap) return;
    if (!this._previewOpen) return;
    if (this._isInsideTsbar(e)) return;

    const path = e.composedPath?.() || [];
    if (this._pathHasClass(path, "pnavbtn")) return;
    if (this._pathHasClass(path, "viewtoggle")) return;
    if (this._pathHasClass(path, "live-picker")) return;
    if (this._pathHasClass(path, "live-picker-backdrop")) return;
    if (this._pathHasClass(path, "live-quick-switch")) return;

    this._previewOpen = false;
    this._showNav = false;
    this.requestUpdate();
  }

  _isInsideTsbar(e) {
    const path = e.composedPath?.() || [];
    return path.some(
      (el) =>
        el?.classList?.contains("tsicon") || el?.classList?.contains("tsbar")
    );
  }

  _navNext(listLen) {
    if (this._selectMode || this._isLiveActive()) return;
    const i = this._selectedIndex ?? 0;
    if (i >= listLen - 1) return;
    this._selectedIndex = i + 1;
    this._pendingScrollToI = this._selectedIndex;
    this.requestUpdate();
    this._showNavChevrons();
  }

  _navPrev() {
    if (this._selectMode || this._isLiveActive()) return;
    const i = this._selectedIndex ?? 0;
    if (i <= 0) return;
    this._selectedIndex = i - 1;
    this._pendingScrollToI = this._selectedIndex;
    this.requestUpdate();
    this._showNavChevrons();
  }

  _onPreviewClick(e) {
    if (this._isLiveActive()) {
      const path = e.composedPath?.() || [];
      const clickedControl =
        this._pathHasClass(path, "live-picker") ||
        this._pathHasClass(path, "live-picker-backdrop") ||
        this._pathHasClass(path, "live-quick-switch") ||
        this._pathHasClass(path, "pnavbtn") ||
        this._pathHasClass(path, "tsbar");

      if (!clickedControl) {
        this._showLiveQuickSwitchButton();
      }
      return;
    }

    this._closePreviewIfEnabled(e);
  }

  _onPreviewPointerDown(e) {
    if (e?.isPrimary === false) return;

    const path = e.composedPath?.() || [];
    if (
      this._isInsideTsbar(e) ||
      this._pathHasClass(path, "pnavbtn") ||
      path.some((el) => el?.tagName === "VIDEO") ||
      this._pathHasClass(path, "viewtoggle") ||
      this._pathHasClass(path, "live-picker") ||
      this._pathHasClass(path, "live-picker-backdrop") ||
      this._pathHasClass(path, "live-quick-switch")
    ) {
      return;
    }

    if (this._isLiveActive()) return;

    this._swiping = true;
    this._swipeStartX = e.clientX;
    this._swipeStartY = e.clientY;

    try {
      e.currentTarget?.setPointerCapture?.(e.pointerId);
    } catch (_) {}
  }

  _getThumbRenderLimit(cap, usingMediaSource) {
    return cap;
  }

  _onPreviewPointerUp(e, listLen) {
    if (!this._swiping) {
      if (this.config?.preview_click_to_open && !this._previewOpen) return;
      if (this._selectMode || this._isLiveActive()) return;
      this._showNavChevrons();
      return;
    }

    this._swiping = false;

    if (this.config?.preview_click_to_open && !this._previewOpen) return;
    if (this._isLiveActive()) return;

    const dx = e.clientX - this._swipeStartX;
    const dy = e.clientY - this._swipeStartY;

    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      this._showNavChevrons();
      return;
    }

    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < 45) return;
    if (this._selectMode) return;

    if (dx < 0) {
      if ((this._selectedIndex ?? 0) < listLen - 1) {
        this._selectedIndex = (this._selectedIndex ?? 0) + 1;
      }
    } else if ((this._selectedIndex ?? 0) > 0) {
      this._selectedIndex = (this._selectedIndex ?? 0) - 1;
    }

    this._pendingScrollToI = this._selectedIndex ?? 0;
    this.requestUpdate();
    this._showNavChevrons();
  }

  _onThumbWheel(e) {
    if (this._isThumbLayoutVertical()) return;

    const el = e.currentTarget;
    if (!el) return;

    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) return;

    const absX = Math.abs(e.deltaX || 0);
    const absY = Math.abs(e.deltaY || 0);

    let delta = absX > absY ? e.deltaX : e.deltaY;

    if (e.shiftKey && absY > 0) {
      delta = e.deltaY;
    }

    if (!Number.isFinite(delta) || Math.abs(delta) < 0.5) return;

    e.preventDefault();
    e.stopPropagation();

    let step = delta;
    if (e.deltaMode === 1) step = delta * 16;
    if (e.deltaMode === 2) step = delta * el.clientWidth * 0.85;

    const next = Math.max(0, Math.min(maxScroll, el.scrollLeft + step));
    el.scrollLeft = next;
  }

  // ─── Lifecycle / config ───────────────────────────────────────────

  setConfig(config) {
    const prevConfig = this.config ? { ...this.config } : null;

    const filename_datetime_format = String(
      config.filename_datetime_format || ""
    ).trim();

    const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
    const num = (v, d) => {
      if (v === null || v === undefined) return d;
      const n = Number(String(v).trim().replace("px", "").replace("%", ""));
      return Number.isFinite(n) ? n : d;
    };

    const posRaw = String(config.bar_position ?? "top").toLowerCase().trim();
    const bar_position =
      posRaw === "bottom" ? "bottom" : posRaw === "hidden" ? "hidden" : "top";

    const thumb_size = Math.max(
      40,
      Math.min(220, num(config.thumb_size, THUMB_SIZE))
    );

    const thumb_bar_position = this._normThumbBarPosition(
      config.thumb_bar_position ?? DEFAULT_THUMB_BAR_POSITION
    );

    const thumb_layout = this._normThumbLayout(
      config.thumb_layout ?? DEFAULT_THUMB_LAYOUT
    );

    const bar_opacity = clamp(
      num(config.bar_opacity, DEFAULT_BAR_OPACITY),
      0,
      100
    );

    const max_media = this._normMaxMedia(config.max_media ?? DEFAULT_MAX_MEDIA);

    let source_mode = this._normSourceMode(
      config.source_mode ?? DEFAULT_SOURCE_MODE
    );

    const preview_position = this._normPreviewPosition(
      config.preview_position ?? DEFAULT_PREVIEW_POSITION
    );

    const entityRaw = String(config?.entity || "").trim();
    const sensorEntitiesClean = this._sensorNormalizeEntities(
      config?.entities,
      entityRaw
    );

    const mediaRaw = String(config?.media_source || "").trim();
    const mediaArrRaw = Array.isArray(config?.media_sources)
      ? config.media_sources
      : Array.isArray(config?.media_folders_fav)
        ? config.media_folders_fav
        : null;

    const mediaSourcesClean = Array.isArray(mediaArrRaw)
      ? mediaArrRaw.map((x) => String(x ?? "").trim()).filter(Boolean)
      : [];

    const visibleObjectFilters = this._normalizeVisibleObjectFilters(
      config.object_filters ?? DEFAULT_VISIBLE_OBJECT_FILTERS
    );

    const entity_filter_map = this._normalizeEntityFilterMap(
      config.entity_filter_map || {}
    );

    if (
      config.source_mode === undefined ||
      config.source_mode === null ||
      String(config.source_mode).trim() === ""
    ) {
      if ((mediaSourcesClean.length || mediaRaw) && !sensorEntitiesClean.length) {
        source_mode = "media";
      } else {
        source_mode = "sensor";
      }
    }

    if (source_mode === "sensor") {
      if (!sensorEntitiesClean.length) {
        throw new Error(
          "camera-gallery-card: 'entity' or 'entities' is required in source_mode: sensor"
        );
      }
    } else if (!mediaRaw && !mediaSourcesClean.length) {
      throw new Error(
        "camera-gallery-card: 'media_source' OR 'media_sources' is required in source_mode: media"
      );
    }

    const allow_delete =
      config.allow_delete !== undefined
        ? !!config.allow_delete
        : DEFAULT_ALLOW_DELETE;

    const allow_bulk_delete =
      config.allow_bulk_delete !== undefined
        ? !!config.allow_bulk_delete
        : DEFAULT_ALLOW_BULK_DELETE;

    const delete_service =
      (config.delete_service && String(config.delete_service).trim()) ||
      (config.shell_command && String(config.shell_command).trim()) ||
      DEFAULT_DELETE_SERVICE;

    const delete_confirm =
      config.delete_confirm !== undefined
        ? !!config.delete_confirm
        : DEFAULT_DELETE_CONFIRM;

    const wantsDelete = source_mode === "sensor" && allow_delete;

    let effectiveAllowDelete = allow_delete;
    let effectiveAllowBulkDelete = allow_bulk_delete;

    if (wantsDelete && !delete_service) {
      effectiveAllowBulkDelete = false;
      effectiveAllowDelete = false;
    }

    if (delete_service && !/^[a-z0-9_]+\.[a-z0-9_]+$/i.test(delete_service)) {
      throw new Error(
        "camera-gallery-card: 'delete_service' must be 'domain.service'"
      );
    }

    const preview_click_to_open =
      config.preview_click_to_open !== undefined
        ? !!config.preview_click_to_open
        : DEFAULT_PREVIEW_CLICK_TO_OPEN;

    const preview_close_on_tap =
      config.preview_close_on_tap !== undefined
        ? !!config.preview_close_on_tap
        : preview_click_to_open
          ? DEFAULT_PREVIEW_CLOSE_ON_TAP_WHEN_GATED
          : false;

    const normalizedMediaRoots =
      source_mode === "media"
        ? this._msNormalizeRoots(
            mediaSourcesClean.length ? mediaSourcesClean : mediaRaw
          )
        : [];

    const live_enabled =
      config.live_enabled !== undefined
        ? !!config.live_enabled
        : DEFAULT_LIVE_ENABLED;

    const live_camera_entity = String(config.live_camera_entity || "").trim();

    const style_variables = String(config.style_variables || "").trim();

    const nextConfig = {
      allow_bulk_delete: effectiveAllowBulkDelete,
      allow_delete: effectiveAllowDelete,
      bar_opacity,
      bar_position,
      delete_confirm,
      delete_service: delete_service || "",
      entities: source_mode === "sensor" ? sensorEntitiesClean : [],
      entity: source_mode === "sensor" ? sensorEntitiesClean[0] || "" : "",
      entity_filter_map,
      filename_datetime_format,
      live_camera_entity,
      live_enabled,
      max_media,
      media_source: source_mode === "media" ? mediaRaw : "",
      media_sources: source_mode === "media" ? normalizedMediaRoots : [],
      object_filters: visibleObjectFilters,
      preview_click_to_open,
      preview_close_on_tap,
      preview_height: Number(config.preview_height) || 320,
      preview_position,
      source_mode,
      style_variables,
      thumb_bar_position,
      thumb_layout,
      thumb_size,
    };

    this.config = nextConfig;

    const changedKeys = prevConfig
      ? this._configChangedKeys(prevConfig, nextConfig)
      : [];
    const sourceChange = prevConfig
      ? this._isSourceConfigChange(changedKeys)
      : true;
    const uiOnlyChange = prevConfig
      ? this._isUiOnlyConfigChange(changedKeys)
      : false;

    if (this._selectedIndex === undefined) this._selectedIndex = 0;
    if (this._selectedSet == null) this._selectedSet = new Set();
    if (!Array.isArray(this._objectFilters)) this._objectFilters = [];

    const visibleSet = new Set(this._getVisibleObjectFilters());
    this._objectFilters = this._objectFilters.filter((x) => visibleSet.has(x));

    const liveOptions = this._getAllLiveCameraEntities();
    const validSelected =
      this._liveSelectedCamera &&
      liveOptions.some((x) => x === this._liveSelectedCamera);

    if (!validSelected) {
      this._liveSelectedCamera =
        (live_camera_entity && liveOptions.includes(live_camera_entity)
          ? live_camera_entity
          : liveOptions[0]) || "";
    }

    if (!prevConfig) {
      this._previewOpen = this.config.preview_click_to_open ? false : true;
      this._showLivePicker = false;
      this._showLiveQuickSwitch = false;
      this._viewMode = "media";
    } else if (
      prevConfig.preview_click_to_open !== this.config.preview_click_to_open
    ) {
      this._previewOpen = !this.config.preview_click_to_open;
    }

    if (sourceChange) {
      this._closeThumbMenu();
      this._forceThumbReset = false;
      this._pendingScrollToI = 0;
      this._previewOpen = !this.config.preview_click_to_open;
      this._selectMode = false;
      this._selectedIndex = 0;
      this._selectedSet.clear();
      this._hideBulkDeleteHint();
      this._resetPosterQueue();
      this._posterCache.clear();
      this._posterPending.clear();
      this._objectCache.clear();
    }

    const liveCameraConfigChanged = changedKeys.some((k) =>
      ["live_camera_entity", "live_enabled"].includes(k)
    );

    if (liveCameraConfigChanged) {
      this._hideLiveQuickSwitchButton();
      this._liveCard = null;
      this._liveCardConfigKey = "";
    }

    if (!this._hasLiveConfig()) {
      this._hideLiveQuickSwitchButton();
      this._showLivePicker = false;
      this._viewMode = "media";
    }

    if (this.config.source_mode === "media") {
      const prevKey = prevConfig
        ? this._msKeyFromRoots(
            prevConfig?.media_sources,
            prevConfig?.media_source
          )
        : "";
      const nextKey = this._msKeyFromRoots(
        this.config?.media_sources,
        this.config?.media_source
      );

      if (!prevConfig || (sourceChange && prevKey !== nextKey)) {
        this._ms.key = "";
        this._ms.list = [];
        this._ms.loadedAt = 0;
        this._ms.loading = false;
        this._ms.roots = [];
        this._ms.urlCache = new Map();
        this._frigateSnapshots = [];
        this._snapshotCache = new Map();
        this._objectCache.clear();
      }
    }

    if (prevConfig && uiOnlyChange) {
      this.requestUpdate();
    }
  }

  updated(changedProps) {
    const dayChanged = changedProps.has("_selectedDay");
    const filterChanged = changedProps.has("_objectFilters");

    if (this._forceThumbReset || dayChanged || filterChanged) {
      this._forceThumbReset = false;
      this._pendingScrollToI = null;
      this._resetThumbScrollToStart();
    } else if (this._pendingScrollToI != null) {
      const i = this._pendingScrollToI;
      this._pendingScrollToI = null;
      this._scrollThumbIntoView(i);
    }

    if (this.config?.source_mode === "media") {
      this._msEnsureLoaded();
    }

    const usingMediaSource = this.config?.source_mode === "media";
    const rawItems = this._items();

    if (rawItems.length) {
      const withDt = rawItems.map((src, idx) => {
        const dtMs = this._dtMsFromSrc(src);
        const dayKey = this._extractDayKey(src);
        return { dayKey, dtMs, idx, src };
      });

      withDt.sort((a, b) => {
        const aOk = Number.isFinite(a.dtMs);
        const bOk = Number.isFinite(b.dtMs);
        if (aOk && bOk && b.dtMs !== a.dtMs) return b.dtMs - a.dtMs;
        if (aOk && !bOk) return -1;
        if (!aOk && bOk) return 1;
        return b.idx - a.idx;
      });

      const allWithDay = withDt.map((x) => ({ dayKey: x.dayKey, src: x.src }));
      const days = this._uniqueDays(allWithDay);
      const newestDay = days[0] ?? null;
      const activeDay = this._selectedDay ?? newestDay;

      const dayFiltered = !activeDay
        ? allWithDay
        : allWithDay.filter((x) => x.dayKey === activeDay);

      const filteredAll = dayFiltered.filter((x) =>
        this._matchesObjectFilter(x.src)
      );

      const cap = this._normMaxMedia(this.config?.max_media);
      const filtered = filteredAll.slice(0, Math.min(cap, filteredAll.length));
      const thumbRenderLimit = this._getThumbRenderLimit(cap, usingMediaSource);

      const idx = filtered.length
        ? Math.min(Math.max(this._selectedIndex ?? 0, 0), filtered.length - 1)
        : 0;

      const selected = filtered.length ? filtered[idx]?.src : "";

      this._scheduleVisibleMediaWork(selected, filtered, idx, usingMediaSource);

      const visibleThumbSlice = filtered.slice(0, thumbRenderLimit);
      const posterWorkSlice = filtered.slice(0, 6);

      this._queueSnapshotResolveForVisibleThumbs(visibleThumbSlice);
      this._queueSensorPosterWork(posterWorkSlice);
    }

    if (this._isLiveActive()) {
      this._mountLiveCard();
    } else {
      this._syncPreviewPlaybackFromState();
    }
  }

  // ─── Render ───────────────────────────────────────────────────────

  render() {
    if (!this._hass || !this.config) return html``;

    const usingMediaSource = this.config?.source_mode === "media";
    const thumbRatio = "1 / 1";
    const rawItems = this._items();
    const visibleObjectFilters = this._getVisibleObjectFilters();

    if (!rawItems.length) {
      if (usingMediaSource && this._ms?.loading) {
        return html`<div class="empty">Loading media…</div>`;
      }
      return html`<div class="empty">No media found.</div>`;
    }

    const withDt = rawItems.map((src, idx) => {
      const dtMs = this._dtMsFromSrc(src);
      const dayKey = this._extractDayKey(src);
      return { dayKey, dtMs, idx, src };
    });

    withDt.sort((a, b) => {
      const aOk = Number.isFinite(a.dtMs);
      const bOk = Number.isFinite(b.dtMs);
      if (aOk && bOk && b.dtMs !== a.dtMs) return b.dtMs - a.dtMs;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return b.idx - a.idx;
    });

    const allWithDay = withDt.map((x) => ({ dayKey: x.dayKey, src: x.src }));
    const days = this._uniqueDays(allWithDay);
    const newestDay = days[0] ?? null;
    const activeDay = this._selectedDay ?? newestDay;

    const dayFiltered = !activeDay
      ? allWithDay
      : allWithDay.filter((x) => x.dayKey === activeDay);

    const filteredAll = dayFiltered.filter((x) =>
      this._matchesObjectFilter(x.src)
    );

    const noResultsForFilter = !filteredAll.length;

    const cap = this._normMaxMedia(this.config?.max_media);
    const filtered = noResultsForFilter
      ? []
      : filteredAll.slice(0, Math.min(cap, filteredAll.length));

    if (!filtered.length) this._selectedIndex = 0;
    else if ((this._selectedIndex ?? 0) >= filtered.length)
      this._selectedIndex = 0;

    const idx = filtered.length
      ? Math.min(Math.max(this._selectedIndex ?? 0, 0), filtered.length - 1)
      : 0;

    const selected = filtered.length ? filtered[idx]?.src : "";

    const thumbRenderLimit = this._getThumbRenderLimit(cap, usingMediaSource);

    const thumbs =
      THUMBS_ENABLED && filtered.length
        ? filtered.slice(0, thumbRenderLimit).map((it, i) => ({ ...it, i }))
        : [];

    let selectedUrl = selected;
    if (this._isMediaSourceId(selected)) {
      selectedUrl = this._ms.urlCache.get(selected) || "";
    }

    let selectedMime = "";
    let selectedCls = "";
    let selectedTitle = "";
    if (usingMediaSource && this._isMediaSourceId(selected)) {
      const meta = this._msMetaById(selected);
      selectedMime = meta.mime;
      selectedCls = meta.cls;
      selectedTitle = meta.title;
    }

    const selectedIsVideo =
      !!selected &&
      this._isVideoSmart(selectedUrl || selectedTitle, selectedMime, selectedCls);

    const tsKey = selected ? this._extractDateTimeKey(selected) : "";
    const tsText = tsKey ? this._formatDateTime(tsKey) : "";
    const tsLabel = selected ? tsText || this._tsLabelFromFilename(selected) : "";

    const currentForNav = activeDay ?? newestDay;
    const dayIdx = currentForNav ? days.indexOf(currentForNav) : -1;
    const canPrev = dayIdx >= 0 && dayIdx < days.length - 1;
    const canNext = dayIdx > 0;
    const isToday = currentForNav === newestDay;

    const sp = this._serviceParts();

    const canDelete =
      this.config?.source_mode === "sensor" &&
      !!this.config?.allow_delete &&
      !!sp;
    const canBulkDelete =
      this.config?.source_mode === "sensor" &&
      !!this.config?.allow_bulk_delete &&
      !!sp;

    const tsPosClass =
      this.config.bar_position === "bottom"
        ? "bottom"
        : this.config.bar_position === "hidden"
          ? "hidden"
          : "top";

    const previewGated = !!this.config?.preview_click_to_open;
    const previewOpen = !previewGated || !!this._previewOpen;

    const showPreviewSection = previewOpen === true;
    const previewAtBottom = this.config?.preview_position === "bottom";

    const selectedNeedsResolve =
      !!selected && usingMediaSource && this._isMediaSourceId(selected);
    const selectedHasUrl = !!selected && (!selectedNeedsResolve || !!selectedUrl);

    const showLiveToggle = this._hasLiveConfig();
    const isLive = this._isLiveActive();
    const isVerticalThumbs = this._isThumbLayoutVertical();

    // ─── Theme-aware CSS custom properties ─────────────────────────
    // All colours are derived from HA's own CSS variables, so any theme
    // (default light, default dark, Graphite, custom HACS themes, etc.)
    // will automatically be reflected. We do not hard-code any palette.
    const rootVars = `
      --gap:10px; --r:18px;
      --barOpacity:${this.config.bar_opacity};
      --thumbRowH:${this.config.thumb_size}px;
      --thumbEmptyH:${this.config.thumb_size}px;
      --topbarMar:${STYLE.topbar_margin};
      --topbarPad:${STYLE.topbar_padding};
      --thumbsMaxHeight:${Math.max(160, Number(this.config.preview_height) || 320)}px;
      ${this.config.style_variables || ""}
    `;

    const previewBlock = showPreviewSection
      ? html`
          <div
            class="preview"
            style="height:${this.config.preview_height}px; touch-action:${isLive
              ? "auto"
              : "pan-y"};"
            @pointerdown=${(e) => {
              if (e?.isPrimary === false) return;

              const path = e.composedPath?.() || [];
              const isOnControls =
                this._isInsideTsbar(e) ||
                this._pathHasClass(path, "pnavbtn") ||
                path.some((el) => el?.tagName === "VIDEO") ||
                this._pathHasClass(path, "live-picker") ||
                this._pathHasClass(path, "live-picker-backdrop") ||
                this._pathHasClass(path, "live-quick-switch");

              if (!isOnControls) {
                e.preventDefault?.();
                e.stopPropagation?.();
                e.stopImmediatePropagation?.();
                try {
                  e.currentTarget?.blur?.();
                } catch (_) {}
              }

              this._onPreviewPointerDown(e);
            }}
            @pointerup=${(e) => this._onPreviewPointerUp(e, filtered.length)}
            @pointercancel=${() => (this._swiping = false)}
            @click=${(e) => this._onPreviewClick(e)}
          >
            ${isLive
              ? this._renderLiveInner()
              : noResultsForFilter
                ? html`
                    <div class="preview-empty">
                      No ${this._filterLabelList(this._objectFilters)} media for this day.
                    </div>
                  `
                : !selectedHasUrl
                  ? html`<div class="empty inpreview">Loading media…</div>`
                  : selectedIsVideo
                    ? html`<div id="preview-video-host" class="preview-video-host"></div>`
                    : html`<img class="pimg" src=${selectedUrl} alt="" />`}

            ${!noResultsForFilter &&
            !isLive &&
            this._showNav &&
            filtered.length > 1
              ? html`
                  <div class="pnav">
                    <button
                      class="pnavbtn left"
                      ?disabled=${idx <= 0}
                      @click=${(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this._navPrev();
                      }}
                      aria-label="Previous"
                      title="Previous"
                    >
                      <ha-icon icon="mdi:chevron-left"></ha-icon>
                    </button>

                    <button
                      class="pnavbtn right"
                      ?disabled=${idx >= filtered.length - 1}
                      @click=${(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this._navNext(filtered.length);
                      }}
                      aria-label="Next"
                      title="Next"
                    >
                      <ha-icon icon="mdi:chevron-right"></ha-icon>
                    </button>
                  </div>
                `
              : html``}

            ${tsPosClass !== "hidden" && !isLive
              ? html`
                  <div class="tsbar ${tsPosClass}">
                    <div class="tsleft">
                      ${!noResultsForFilter ? tsLabel || "—" : "—"}
                    </div>
                    <div class="tspill">
                      <span class="tspill-val">${idx + 1}/${filtered.length}</span>
                    </div>
                  </div>
                `
              : html``}
          </div>
        `
      : html``;

    const objectFiltersBlock = visibleObjectFilters.length
      ? html`
          <div class="objfilters" role="group" aria-label="Object filters">
            ${visibleObjectFilters.map((filterValue) => {
              const objIcon = this._objectIcon(filterValue);
              const label = this._filterLabel(filterValue);
              return html`
                <button
                  class="objbtn icon-only ${this._isObjectFilterActive(filterValue)
                    ? "on"
                    : ""}"
                  @click=${() => this._setObjectFilter(filterValue)}
                  title="Filter ${label}"
                  aria-label="Filter ${label}"
                >
                  ${objIcon
                    ? html`<ha-icon icon="${objIcon}"></ha-icon>`
                    : html``}
                </button>
              `;
            })}
          </div>
        `
      : html``;

    const thumbsBlock = html`
      <div class="timeline ${noResultsForFilter ? "timeline-empty" : ""}">
        ${this._selectMode && (this._selectedSet?.size ?? 0)
          ? html`
              <div class="bulkbar topbulk">
                <div class="bulkbar-left">
                  <div class="bulkbar-text">
                    ${this._selectedSet.size} selected
                  </div>
                </div>

                <div class="bulkactions">
                  <button
                    type="button"
                    class="bulkaction bulkcancel"
                    title="Cancel"
                    aria-label="Cancel"
                    @click=${(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      this._exitSelectMode();
                    }}
                  >
                    <ha-icon icon="mdi:close"></ha-icon>
                    <span>Cancel</span>
                  </button>

                  <button
                    type="button"
                    class="bulkaction bulkdelete"
                    title="Delete"
                    aria-label="Delete"
                    ?disabled=${!canDelete}
                    @click=${async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      await this._bulkDelete(this._selectedSet);
                    }}
                  >
                    <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            `
          : html``}

        <div
          class="tthumbs-wrap ${isVerticalThumbs ? "vertical" : "horizontal"} ${noResultsForFilter ? "empty" : ""}"
        >
          ${thumbs.length
            ? html`
                <div
                  class="tthumbs ${isVerticalThumbs ? "vertical" : "horizontal"}"
                  style="--tgap:${THUMB_GAP}px;"
                  @wheel=${isVerticalThumbs ? null : this._onThumbWheel}
                >
                  ${thumbs.map((it) => {
                    const isOn = it.i === idx && !isLive;
                    const isSel = this._selectedSet?.has(it.src);
                    const isMs = usingMediaSource && this._isMediaSourceId(it.src);

                    let thumbUrl = it.src;
                    if (isMs) thumbUrl = this._ms.urlCache.get(it.src) || "";

                    let tMime = "";
                    let tCls = "";
                    let tTitle = "";
                    if (isMs) {
                      const meta = this._msMetaById(it.src);
                      tMime = meta.mime;
                      tCls = meta.cls;
                      tTitle = meta.title;
                    }

                    const isVid = this._isVideoSmart(
                      thumbUrl || tTitle,
                      tMime,
                      tCls
                    );

                    let poster = "";

                    if (isVid) {
                      if (isMs) {
                        let snapshotUrl = "";

                        if (this._hasFrigateSource()) {
                          const snapshotId = this._findMatchingSnapshotMediaId(it.src);
                          snapshotUrl = snapshotId
                            ? this._ms?.urlCache?.get(snapshotId) || ""
                            : "";
                        }

                        poster = snapshotUrl || "";
                      } else {
                        poster = this._posterCache.get(it.src) || "";
                      }
                    } else {
                      poster = thumbUrl;
                    }

                    const needsResolve = isMs;
                    const hasUrl = !needsResolve || !!thumbUrl;
                    const showImg = hasUrl && !!poster;

                    const tMs = this._dtMsFromSrc(it.src);
                    const tTime = this._formatTimeFromMs(tMs);

                    const obj = this._objectForSrc(it.src);
                    const objIcon = this._objectIcon(obj);
                    const objColor = this._objectColor(obj);

                    const barPos = this.config?.thumb_bar_position || "bottom";
                    const showBar = barPos !== "hidden" && (!!tTime || !!objIcon);
                    const thumbStyle = isVerticalThumbs
                      ? `aspect-ratio:${thumbRatio};border-radius:${THUMB_RADIUS}px;`
                      : `width:${this.config.thumb_size}px;aspect-ratio:${thumbRatio};border-radius:${THUMB_RADIUS}px;`;

                    return html`
                      <button
                        class="tthumb ${isOn ? "on" : ""} ${this._selectMode && isSel ? "sel" : ""}"
                        data-i="${it.i}"
                        style="${thumbStyle}"
                        @pointerdown=${(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.stopImmediatePropagation?.();
                          e.currentTarget?.blur?.();
                          this._onThumbPointerDown(e, it);
                        }}
                        @pointermove=${(e) => this._onThumbPointerMove(e)}
                        @pointerup=${() => this._onThumbPointerUp()}
                        @pointercancel=${() => this._onThumbPointerCancel()}
                        @pointerleave=${() => this._onThumbPointerCancel()}
                        @contextmenu=${(e) => this._onThumbContextMenu(e, it)}
                        @click=${(e) => {
                          e.preventDefault();
                          e.stopPropagation();

                          if (this._suppressNextThumbClick) {
                            this._suppressNextThumbClick = false;
                            return;
                          }

                          if (this._selectMode) {
                            this._toggleSelected(it.src);
                            return;
                          }

                          if (this._isLiveActive()) {
                            this._setViewMode("media");
                          }

                          if (this.config?.preview_click_to_open) {
                            this._previewOpen = true;
                          }

                          this._pendingScrollToI = it.i;
                          this._selectedIndex = it.i;
                          this.requestUpdate();
                        }}
                      >
                        ${showImg
                          ? html`<img
                              class="timg"
                              src="${poster}"
                              alt=""
                              loading="lazy"
                            />`
                          : html`<div class="tph" aria-hidden="true"></div>`}

                        ${showBar
                          ? html`
                              <div class="tbar ${barPos}">
                                <div class="tbar-left">${tTime || "—"}</div>
                                ${objIcon
                                  ? html`
                                      <ha-icon
                                        class="tbar-icon"
                                        icon="${objIcon}"
                                        style="color:${objColor}"
                                      ></ha-icon>
                                    `
                                  : html``}
                              </div>
                            `
                          : html``}

                        ${this._selectMode
                          ? html`
                              <div class="selOverlay ${isSel ? "on" : ""}">
                                <ha-icon icon="mdi:check"></ha-icon>
                              </div>
                            `
                          : html``}
                      </button>
                    `;
                  })}
                </div>
              `
            : noResultsForFilter
              ? html`
                  <div class="thumbs-empty-state">
                    No ${this._filterLabelList(this._objectFilters)} media for this day.
                  </div>
                `
              : html``}
        </div>
      </div>
    `;

    return html`
      <div class="root" style="${rootVars}">
        <div class="panel" style="width:${PREVIEW_WIDTH}; margin:0 auto;">
          ${!previewAtBottom && showPreviewSection
            ? html`${previewBlock}<div class="divider"></div>`
            : html``}

          <div class="topbar">
            <div class="seg" role="tablist" aria-label="Filter">
              <button
                class="segbtn ${isToday ? "on" : ""}"
                @click=${() => {
                  this._selectedDay = newestDay;
                  this._selectedIndex = 0;
                  this._pendingScrollToI = null;
                  this._forceThumbReset = true;
                  this._exitSelectMode();
                  if (this.config?.preview_click_to_open) this._previewOpen = false;
                  if (this._isLiveActive()) this._setViewMode("media");
                  this.requestUpdate();
                }}
                title="Today"
                role="tab"
                aria-selected=${isToday}
              >
                <span>Today</span>
              </button>
            </div>

            <div class="datepill" role="group" aria-label="Day navigation">
              <button
                class="iconbtn"
                ?disabled=${!canPrev}
                @click=${() => this._stepDay(+1, days, currentForNav)}
                aria-label="Previous day"
                title="Previous day"
              >
                <ha-icon icon="mdi:chevron-left"></ha-icon>
              </button>
              <div class="dateinfo" title="Selected day">
                <span class="txt"
                  >${currentForNav ? this._formatDay(currentForNav) : "—"}</span
                >
              </div>
              <button
                class="iconbtn"
                ?disabled=${!canNext}
                @click=${() => this._stepDay(-1, days, currentForNav)}
                aria-label="Next day"
                title="Next day"
              >
                <ha-icon icon="mdi:chevron-right"></ha-icon>
              </button>
            </div>

            ${showLiveToggle
              ? html`
                  <div class="seg">
                    <button
                      class="segbtn livebtn ${isLive ? "on" : ""}"
                      title="${isLive ? "Close live" : "Open live"}"
                      @click=${(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this._toggleLiveMode();
                      }}
                    >
                      <span>LIVE</span>
                    </button>
                  </div>
                `
              : html``}
          </div>

          ${visibleObjectFilters.length
            ? html`
                <div class="divider"></div>
                ${objectFiltersBlock}
              `
            : html``}

          ${thumbsBlock}

          ${previewAtBottom && showPreviewSection
            ? html`<div class="divider"></div>${previewBlock}`
            : html``}
        </div>

        ${this._showBulkHint && this._selectMode
          ? html`
              <div class="bulk-floating-hint">
                Select thumbnails to delete
              </div>
            `
          : html``}

        ${this._renderThumbActionSheet()}
      </div>
    `;
  }

  static get styles() {
    return css`
      /*
       * ──────────────────────────────────────────────────────────────
       * Theme tokens
       *
       * Every colour is derived from Home Assistant's own CSS custom
       * properties, so any active theme (Default, Dark, Graphite, or
       * any HACS theme) is reflected automatically.
       *
       * We expose a small set of internal tokens that map HA variables
       * to semantic roles used throughout this card.
       * ──────────────────────────────────────────────────────────────
       */
      :host {
        display: block;

        /* ── text ── */
        --cgc-txt:          var(--primary-text-color,   rgba(0,0,0,0.87));
        --cgc-txt2:         var(--secondary-text-color, rgba(0,0,0,0.60));
        --cgc-txt-dis:      var(--disabled-text-color,  rgba(0,0,0,0.38));

        /* ── surfaces ── */
        --cgc-card-bg:      var(--card-background-color, #fff);
        --cgc-preview-bg:   var(--card-background-color, #fff);

        /* ── controls / chrome ── */
        --cgc-ui-bg:        var(--secondary-background-color, rgba(0,0,0,0.08));
        --cgc-ui-stroke:    var(--divider-color,              rgba(0,0,0,0.12));
        --cgc-divider:      var(--divider-color,              rgba(0,0,0,0.10));
        --cgc-thumb-bg:     var(--secondary-background-color, rgba(0,0,0,0.06));
        --cgc-tbar-bg:      var(--secondary-background-color, rgba(0,0,0,0.16));
        --cgc-pill-bg:      var(--secondary-background-color, rgba(0,0,0,0.10));

        /* ── nav overlay buttons ── */
        --cgc-nav-bg:       rgba(0,0,0,0.18);
        --cgc-nav-border:   rgba(0,0,0,0.18);

        /* ── selection overlay ── */
        --cgc-sel-ov-a:     rgba(0,0,0,0.10);
        --cgc-sel-ov-b:     rgba(0,0,0,0.22);

        /* ── bulk bar ── */
        --cgc-bulk-bg:      var(--secondary-background-color, rgba(0,0,0,0.06));
        --cgc-bulk-border:  var(--divider-color,              rgba(0,0,0,0.10));

        /* ── timestamp bar overlay (uses rgba so opacity var works) ── */
        /* We read bar opacity from JS via --barOpacity */
        --cgc-ts-r: 0;
        --cgc-ts-g: 0;
        --cgc-ts-b: 0;
      }

      /*
       * Dark mode: HA sets --card-background-color, --primary-text-color
       * etc. to dark-mode values automatically.  We only need to tweak
       * things that are NOT already driven by HA variables.
       */
      @media (prefers-color-scheme: dark) {
        :host {
          --cgc-nav-bg:     rgba(0,0,0,0.45);
          --cgc-nav-border: rgba(255,255,255,0.18);
          --cgc-sel-ov-a:   rgba(0,0,0,0.18);
          --cgc-sel-ov-b:   rgba(0,0,0,0.32);
        }
      }

      /* HA also exposes a class-based dark-mode flag on <body> */
      :host-context(.dark-mode) {
        --cgc-nav-bg:     rgba(0,0,0,0.45);
        --cgc-nav-border: rgba(255,255,255,0.18);
        --cgc-sel-ov-a:   rgba(0,0,0,0.18);
        --cgc-sel-ov-b:   rgba(0,0,0,0.32);
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

      .panel {
        background: var(--cgc-card-bg, var(--card-background-color, #fff));
        border-radius: var(--r);
        box-sizing: border-box;
        padding: var(--cardPad, 10px 12px);
      }

      .divider {
        height: 1px;
        background: var(--cgc-divider);
        margin: 12px 0;
      }

      .preview {
        position: relative;
        -webkit-mask-image: -webkit-radial-gradient(white, black);
        background: var(--cgc-preview-bg);
        border-radius: var(--r);
        overflow: hidden;
        transform: translateZ(0);
        width: 100%;
      }

      .pimg {
        display: block;
        height: 100%;
        object-fit: cover;
        width: 100%;
      }

      .live-stage {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      .live-card-host {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        background: #000;
        border-radius: inherit;
        overflow: hidden;
      }

      .live-card-host > * {
        width: 100% !important;
        height: 100% !important;
        display: block !important;
      }

      .live-card-host ha-card {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        box-shadow: none !important;
        background: transparent !important;
        border-radius: 0 !important;
        overflow: hidden !important;
      }

      .live-card-host video {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
      }

      .live-badge {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 20;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(255, 0, 0, 0.88);
        color: #fff;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.4px;
        line-height: 1;
        pointer-events: none;
      }

      .segbtn.livebtn {
        width: 60px;
      }

      .segbtn.livebtn.on {
        background: #ff0000;
        color: #ffffff;
      }

      .preview-video-host {
        width: 100%;
        height: 100%;
      }

      .preview-video-host > video {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }

      .live-dot {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: #fff;
        display: inline-block;
        box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.75);
        animation: livePulse 1.35s infinite;
      }

      .live-quick-switch {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 22;
        width: 42px;
        height: 42px;
        border: 0;
        border-radius: 999px;
        display: grid;
        place-items: center;
        cursor: pointer;
        color: #fff;
        background: rgba(0, 0, 0, 0.52);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
      }

      .live-quick-switch ha-icon {
        --ha-icon-size: 22px;
        --mdc-icon-size: var(--ha-icon-size);
        width: var(--ha-icon-size);
        height: var(--ha-icon-size);
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
        background: var(--card-background-color, rgba(24,24,28,0.94));
        border: 1px solid var(--divider-color, rgba(255,255,255,0.10));
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.34);
        color: var(--primary-text-color);

        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
      }

      .live-picker-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 18px;
        border-bottom: 1px solid var(--divider-color, rgba(255,255,255,0.08));
      }

      .tthumbs-wrap {
        width: 100%;
        box-sizing: border-box;
        margin-top: 10px;
      }

      .tthumbs-wrap.horizontal {
        min-height: var(--thumbRowH, 86px);
      }

      .tthumbs-wrap.vertical {
        min-height: var(--thumbsMaxHeight, 320px);
      }

      .tthumbs-wrap.empty.horizontal {
        height: var(--thumbEmptyH, 86px);
        min-height: var(--thumbEmptyH, 86px);
        max-height: var(--thumbEmptyH, 86px);
        display: flex;
        align-items: stretch;
        background: transparent;
      }

      .tthumbs-wrap.empty.vertical {
        min-height: var(--thumbsMaxHeight, 320px);
        display: flex;
        align-items: stretch;
        background: transparent;
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

      .live-picker-title {
        font-size: 16px;
        font-weight: 900;
        color: var(--primary-text-color);
      }

      .live-picker-close {
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
      }

      .live-picker-close ha-icon {
        --ha-icon-size: 18px;
        --mdc-icon-size: var(--ha-icon-size);
        width: var(--ha-icon-size);
        height: var(--ha-icon-size);
      }

      .live-picker-list {
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        display: flex;
        flex-direction: column;
      }

      .live-picker-item {
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
        border-top: 1px solid var(--divider-color, rgba(255,255,255,0.05));
      }

      .live-picker-item:first-child {
        border-top: 0;
      }

      .live-picker-item:hover {
        background: var(--cgc-ui-bg);
      }

      .live-picker-item.on {
        background: rgba(var(--rgb-primary-color, 33,150,243), 0.16);
      }

      .live-picker-item-left {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        flex: 1 1 auto;
      }

      .live-picker-item-left ha-icon {
        --ha-icon-size: 20px;
        --mdc-icon-size: var(--ha-icon-size);
        width: var(--ha-icon-size);
        height: var(--ha-icon-size);
        color: var(--primary-color, #4da3ff);
        flex: 0 0 auto;
      }

      .live-picker-item-left span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 15px;
        font-weight: 800;
      }

      .live-picker-check {
        --ha-icon-size: 22px;
        --mdc-icon-size: var(--ha-icon-size);
        width: var(--ha-icon-size);
        height: var(--ha-icon-size);
        color: var(--primary-color, #4da3ff);
        flex: 0 0 auto;
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
        border-radius: 6px;
        padding: 0;
        background: var(--cgc-obj-btn-bg, var(--cgc-ui-bg));
        color: var(--cgc-obj-icon-color, var(--cgc-txt));
        display: grid;
        place-items: center;
        cursor: pointer;
      }

      .objbtn.on {
        background: var(--cgc-obj-btn-active-bg, var(--primary-color, #2196f3));
        color: var(--cgc-obj-icon-active-color, var(--text-primary-color, #fff));
      }

      .objbtn ha-icon {
        --ha-icon-size: 22px;
        --mdc-icon-size: var(--ha-icon-size);
        width: var(--ha-icon-size);
        height: var(--ha-icon-size);
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
        border: 1px solid var(--cgc-nav-border);
        background: var(--cgc-nav-bg);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        color: var(--cgc-txt);
        display: grid;
        place-items: center;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
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
        /* Use RGB channels of black (default) so opacity interpolation works. */
        background: rgba(
          var(--cgc-ts-r, 0),
          var(--cgc-ts-g, 0),
          var(--cgc-ts-b, 0),
          calc(var(--barOpacity, 45) / 100)
        );
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-sizing: border-box;
        pointer-events: none;
        z-index: 2;
        backdrop-filter: blur(calc(8px * min(1, var(--barOpacity, 45))));
        -webkit-backdrop-filter: blur(
          calc(8px * min(1, var(--barOpacity, 45)))
        );
      }

      .tsbar.top {
        top: 0;
      }

      .tsbar.bottom {
        bottom: 0;
      }

      .tsleft {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tspill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 12px;
        border-radius: 999px;
        background: var(--cgc-pill-bg);
        backdrop-filter: blur(6px);
        color: var(--cgc-txt);
        font-size: 11px;
        font-weight: 800;
        white-space: nowrap;
        pointer-events: auto;
        flex-shrink: 0;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: var(--topbarPad, 0px);
        margin: var(--topbarMar, 0px);
        overflow: hidden;
        min-width: 0;
      }

      .seg {
        display: inline-flex;
        align-items: center;
        height: 30px;
        background: var(--cgc-ui-bg);
        border-radius: 10px;
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
        color: var(--cgc-txt2);
        background: transparent;
        font-size: 13px;
        font-weight: 700;
        white-space: nowrap;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .segbtn.on {
        background: var(--primary-color, #2196f3);
        color: var(--text-primary-color, #fff);
        border-radius: 8px;
      }

      .datepill {
        display: flex;
        align-items: center;
        height: 30px;
        background: var(--cgc-ui-bg);
        border-radius: 10px;
        overflow: hidden;
        flex: 1 1 auto;
        min-width: 0;
      }

      .iconbtn {
        width: 44px;
        height: 44px;
        border: 0;
        background: transparent;
        color: var(--cgc-txt);
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
        color: var(--cgc-txt);
        font-size: 13px;
        font-weight: 800;
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
      }

      .tthumbs.horizontal {
        display: flex;
        align-items: center;
        gap: var(--tgap, 12px);
        margin-top: 10px;
        margin-bottom: 0;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 2px;
        overscroll-behavior-x: contain;
        overscroll-behavior-y: none;
      }

      .tthumbs.vertical {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        align-items: start;
        gap: var(--tgap, 12px);
        margin-top: 10px;
        margin-bottom: 0;
        width: 100%;
        max-height: var(--thumbsMaxHeight, 320px);
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior-y: contain;
        overscroll-behavior-x: none;
        padding-right: 2px;
      }

      .tthumbs.vertical .tthumb {
        width: 100%;
        height: auto;
        min-width: 0;
      }

      .tthumbs.vertical .timg,
      .tthumbs.vertical .tph {
        width: 100%;
        height: 100%;
        aspect-ratio: 1 / 1;
      }

      .tthumb:focus {
        outline: none;
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
      }

      .tthumb.on {
        opacity: 1;
        transform: scale(1);
        z-index: 2;
      }

      .tthumb:active {
        transform: scale(0.97);
      }

      .tthumb.on:active {
        transform: scale(0.985);
      }

      .tthumb::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        box-sizing: border-box;
        border: 1px solid var(--cgc-ui-stroke);
      }

      .tthumb.sel::after {
        border: 2px solid rgba(255, 192, 203, 0.95);
      }

      .timg {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .tph {
        width: 100%;
        height: 100%;
        background: var(--cgc-thumb-bg);
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
        color: var(--cgc-txt);
        pointer-events: none;
        z-index: 2;
      }

      .tbar.bottom {
        bottom: 0;
        border-bottom-left-radius: 14px;
        border-bottom-right-radius: 14px;
      }

      .tbar.top {
        top: 0;
        border-top-left-radius: 14px;
        border-top-right-radius: 14px;
      }

      .tbar.hidden {
        display: none;
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
        background: var(--cgc-sel-ov-b);
      }

      .selOverlay ha-icon {
        color: var(--cgc-txt);
        --mdc-icon-size: 22px;
        --ha-icon-size: 22px;
        width: 22px;
        height: 22px;
      }

      .bulkbar {
        margin: 10px 0 0 0;
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
      }

      .bulkaction ha-icon {
        --ha-icon-size: 16px;
        --mdc-icon-size: var(--ha-icon-size);
      }

      .bulkaction[disabled] {
        opacity: 0.45;
        cursor: default;
      }

      .bulkcancel {
        background: var(--cgc-ui-bg);
      }

      .bulkdelete {
        background: rgba(255, 0, 0, 0.18);
        border: 1px solid rgba(255, 0, 0, 0.35);
      }

      @media (max-width: 700px) {
        .bulkbar {
          padding: 10px 12px;
          border-radius: 20px;
          gap: 12px;
          min-height: 64px;
        }

        .bulkbar-check {
          width: 48px;
          height: 48px;
          border-radius: 14px;
        }

        .bulkbar-check ha-icon {
          --ha-icon-size: 26px;
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

      .empty {
        padding: 12px;
        border-radius: 14px;
        background: var(--cgc-ui-bg);
        color: var(--cgc-txt);
      }

      .empty.inpreview {
        position: absolute;
        inset: 50% auto auto 50%;
        transform: translate(-50%, -50%);
        z-index: 3;
      }

      .filter-empty {
        text-align: center;
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
        background: var(--card-background-color, rgba(24,24,28,0.96));
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color, rgba(255,255,255,0.1));
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
      }

      .thumb-menu-item:hover {
        background: var(--cgc-ui-bg);
      }

      .thumb-menu-item.danger {
        color: var(--error-color, #ff8a80);
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

        .live-quick-switch {
          width: 38px;
          height: 38px;
          left: 10px;
        }

        .live-quick-switch ha-icon {
          --ha-icon-size: 20px;
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
  }
}

customElements.define("camera-gallery-card", CameraGalleryCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "camera-gallery-card",
  name: "Camera Gallery Card",
  description:
    "Media gallery for Home Assistant (sensor fileList OR media_source folder) with optional live preview",
});

console.info(`Camera Gallery Card v${CARD_VERSION}`);
