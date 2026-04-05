/**
 * Camera Gallery Card
 */

const CARD_VERSION = "2.3.0";

// -------- HARD CODED SETTINGS --------
const ATTR_NAME = "fileList";
const PREVIEW_WIDTH = "100%";

const SENSOR_POSTER_CONCURRENCY = 4;
const SENSOR_POSTER_QUEUE_LIMIT = 100;

const THUMBS_ENABLED = true;

const THUMB_GAP = 2;
const THUMB_RADIUS = 10;
const THUMB_SIZE = 86;

const DEFAULT_ALLOW_BULK_DELETE = true;
const DEFAULT_ALLOW_DELETE = true;
const DEFAULT_BAR_OPACITY = 30;
const DEFAULT_BROWSE_TIMEOUT_MS = 10000;
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
const DEFAULT_RESOLVE_BATCH = 8;
const DEFAULT_SOURCE_MODE = "sensor"; // "sensor" | "media"
const DEFAULT_THUMB_BAR_POSITION = "bottom"; // "bottom" | "top" | "hidden"
const DEFAULT_THUMB_LAYOUT = "horizontal"; // "horizontal" | "vertical"
const DEFAULT_VISIBLE_OBJECT_FILTERS = [];
const DEFAULT_WALK_DEPTH = 6;

const DEFAULT_AUTOPLAY = false;
const DEFAULT_AUTOMUTED = true;
const DEFAULT_LIVE_AUTO_MUTED = true;

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
      _swipeCurX: { type: Number },
      _swipeCurY: { type: Number },
      _swiping: { type: Boolean },
      _thumbMenuItem: { type: Object },
      _thumbMenuOpen: { type: Boolean },
      _viewMode: { type: String }, // "media" | "live"
      _liveMuted: { type: Boolean },
      _liveFullscreen: { type: Boolean },
      _imgFsOpen: { type: Boolean },
      _aspectRatio: { type: String },
      _liveMicActive: { type: Boolean },
      _hamburgerOpen: { type: Boolean },
    };
  }

  static getConfigElement() {
    return document.createElement("camera-gallery-card-editor");
  }

  static getStubConfig(hass) {
    const states = hass?.states ?? {};
    const cameraEntity = Object.keys(states).find(
      (e) => e.startsWith("camera.") && states[e]?.state !== "unavailable"
    );
    return {
      source_mode: "sensor",
      entities: [],
      live_enabled: true,
      live_camera_entity: cameraEntity ?? "",
      thumb_size: 140,
      bar_position: "top",
      object_filters: DEFAULT_VISIBLE_OBJECT_FILTERS,
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
    this._msBrowseTtlCache = new Map();
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
    this._pillsVisible = false;
    this._pillsTimer = null;
    this._srcEntityMap = new Map();
    this._suppressNextThumbClick = false;
    this._swipeStartX = 0;
    this._swipeStartY = 0;
    this._swipeCurX = 0;
    this._swipeCurY = 0;
    this._swiping = false;
    this._thumbLongPressStartX = 0;
    this._thumbLongPressStartY = 0;
    this._thumbLongPressTimer = null;
    this._thumbMenuItem = null;
    this._thumbMenuOpen = false;
    this._thumbMenuOpenedAt = 0;
    this._viewMode = "media";
    this._liveSelectedCamera = "";
    this._liveMuted = false;
    this._liveFullscreen = false;
    this._imgFsOpen = false;
    this._hamburgerOpen = false;

    // Pinch-to-zoom state (alleen actief in fullscreen live mode)
    this._zoomScale = 1;
    this._zoomPanX = 0;
    this._zoomPanY = 0;
    this._zoomPinchDist = 0;
    this._zoomPinchScale = 1;
    this._zoomIsPinching = false;
    this._zoomIsPanning = false;
    this._zoomPanStartX = 0;
    this._zoomPanStartY = 0;
    this._zoomPanBaseX = 0;
    this._zoomPanBaseY = 0;

    this._onFullscreenChange = () => {
      const isFs = document.fullscreenElement === this || document.webkitFullscreenElement === this;
      if (isFs) {
        this.setAttribute('data-live-fs', '');
        this._showPills();
      } else if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        this.removeAttribute('data-live-fs');
        this._liveFullscreen = false;
        this._resetZoom();
      }
      this.requestUpdate();
    };

    this._onZoomTouchStart = (e) => {
      if (!this._isLiveFullscreen()) return;
      if (e.touches.length === 2) {
        e.preventDefault();
        this._zoomIsPinching = true;
        this._zoomIsPanning = false;
        const t = e.touches;
        this._zoomPinchDist = Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
        this._zoomPinchScale = this._zoomScale;
      } else if (e.touches.length === 1 && this._zoomScale > 1) {
        e.preventDefault();
        this._zoomIsPanning = true;
        this._zoomIsPinching = false;
        this._zoomPanStartX = e.touches[0].clientX;
        this._zoomPanStartY = e.touches[0].clientY;
        this._zoomPanBaseX = this._zoomPanX;
        this._zoomPanBaseY = this._zoomPanY;
      }
    };

    this._onZoomTouchMove = (e) => {
      if (!this._isLiveFullscreen()) return;
      if (this._zoomIsPinching && e.touches.length >= 2) {
        e.preventDefault();
        const t = e.touches;
        const dist = Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
        this._zoomScale = Math.max(1, Math.min(5, this._zoomPinchScale * (dist / this._zoomPinchDist)));
        if (this._zoomScale <= 1) { this._zoomPanX = 0; this._zoomPanY = 0; }
        else this._clampZoomPan();
        this._applyZoom();
      } else if (this._zoomIsPanning && e.touches.length === 1 && this._zoomScale > 1) {
        e.preventDefault();
        this._zoomPanX = this._zoomPanBaseX + (e.touches[0].clientX - this._zoomPanStartX);
        this._zoomPanY = this._zoomPanBaseY + (e.touches[0].clientY - this._zoomPanStartY);
        this._clampZoomPan();
        this._applyZoom();
      }
    };

    this._onZoomTouchEnd = (e) => {
      if (e.touches.length < 2) this._zoomIsPinching = false;
      if (e.touches.length === 0) this._zoomIsPanning = false;
      if (this._zoomScale < 1.05) this._resetZoom();
    };

    this._onZoomWheel = (e) => {
      if (!this._isLiveFullscreen() || !e.ctrlKey) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const oldScale = this._zoomScale;
      const newScale = Math.max(1, Math.min(5, oldScale * factor));
      if (newScale !== oldScale) {
        // Zoom naar de cursorpositie: bereken de layout center van het element
        // (onafhankelijk van de huidige transform) en gebruik cursor-offset als ankerpunt.
        // LC = visual center - panOffset (want visual center = layout center + pan)
        const host = this.renderRoot?.querySelector('#live-card-host');
        if (host) {
          const r = host.getBoundingClientRect();
          const lcX = r.left + r.width / 2 - this._zoomPanX;
          const lcY = r.top + r.height / 2 - this._zoomPanY;
          const k = newScale / oldScale;
          this._zoomPanX = (e.clientX - lcX) * (1 - k) + this._zoomPanX * k;
          this._zoomPanY = (e.clientY - lcY) * (1 - k) + this._zoomPanY * k;
        }
        this._zoomScale = newScale;
      }
      if (this._zoomScale <= 1) { this._zoomPanX = 0; this._zoomPanY = 0; }
      else this._clampZoomPan();
      this._applyZoom();
    };

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

    this._revealedThumbs = new Set();
    this._thumbObserver = null;
    this._thumbObserverRoot = null;
    this._observedThumbs = new WeakSet();
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("fullscreenchange", this._onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", this._onFullscreenChange);
    this.addEventListener('touchstart', this._onZoomTouchStart, { passive: false });
    this.addEventListener('touchmove', this._onZoomTouchMove, { passive: false });
    this.addEventListener('touchend', this._onZoomTouchEnd);
    this.addEventListener('touchcancel', this._onZoomTouchEnd);
    this.addEventListener('wheel', this._onZoomWheel, { passive: false });
    if (navigator.maxTouchPoints > 0) this._showPills(5000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener("fullscreenchange", this._onFullscreenChange);
    document.removeEventListener("webkitfullscreenchange", this._onFullscreenChange);
    this.removeEventListener('touchstart', this._onZoomTouchStart);
    this.removeEventListener('touchmove', this._onZoomTouchMove);
    this.removeEventListener('touchend', this._onZoomTouchEnd);
    this.removeEventListener('touchcancel', this._onZoomTouchEnd);
    this.removeEventListener('wheel', this._onZoomWheel);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

    if (this._liveQuickSwitchTimer) clearTimeout(this._liveQuickSwitchTimer);
    if (this._navHideT) clearTimeout(this._navHideT);
    if (this._bulkHintTimer) clearTimeout(this._bulkHintTimer);

    this._liveQuickSwitchTimer = null;
    this._navHideT = null;
    this._bulkHintTimer = null;

    this._clearPreviewVideoHostPlayback();

    this._clearThumbLongPress();

    if (this._thumbObserver) {
      this._thumbObserver.disconnect();
      this._thumbObserver = null;
    }

    this._stopMicStream();
  }

  set hass(hass) {
    const firstHass = !this._hass;
    const oldHass = this._hass;
    this._hass = hass;

    if (firstHass) {
      if (this.config?.start_mode === "live" && this._hasLiveConfig()) {
        this._viewMode = "live";
      }
      this.requestUpdate();
      return;
    }

    // Forward hass to live card immediately — no re-render needed just for token refresh
    if (this._liveCard) this._liveCard.hass = hass;

    // Only re-render when an entity we actually display has changed state
    const sensorIds = this._sensorEntityList();
    const cameraIds = Array.isArray(this.config?.live_camera_entities)
      ? this.config.live_camera_entities
      : [];
    const watchIds = [...sensorIds, ...cameraIds];

    if (
      watchIds.length > 0 &&
      !watchIds.some((id) => oldHass?.states[id] !== hass.states[id])
    ) {
      return;
    }

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
    this._syncCurrentMedia(selected);

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
    if (this._posterCache.has(key)) return;
    if (this._posterPending.has(key)) return;
    if (this._posterQueued.has(key)) return;
    if (this._posterInFlight.has(key)) return;

    this._posterQueued.add(key);
    this._posterQueue.push(key);

    if (this._posterQueue.length > SENSOR_POSTER_QUEUE_LIMIT) {
      this._posterQueue.length = SENSOR_POSTER_QUEUE_LIMIT;
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
    this._posterPending.clear();
  }

  _closePreview() {
      this._previewOpen = false;
      this.requestUpdate();
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

    const shouldAutoplay = this.config?.autoplay === true;
    const shouldMute =
      this.config?.auto_muted !== undefined
        ? this.config.auto_muted === true
        : true;

    video.autoplay = shouldAutoplay;
    video.muted = shouldMute;

    if (video.src !== selectedUrl) {
      video.src = selectedUrl;

      const poster = this._posterCache.get(selectedUrl) || "";
      if (poster) {
        video.poster = poster;
      } else {
        video.removeAttribute("poster");
        // Enqueue poster pas na laden: voorkomt dat de capture de preview-verbinding blokkeert
        const urlForPoster = selectedUrl;
        video.addEventListener("canplay", () => {
          if (!this._posterCache.has(urlForPoster)) this._enqueuePoster(urlForPoster);
        }, { once: true });
      }

      if (shouldAutoplay) {
        // video.load() reset muted in sommige browsers naar defaultMuted.
        // Herstel muted ná load en start expliciet via play() zodat autoplay
        // niet afhankelijk is van een recente user-gesture (relevant in MS mode
        // waar de URL async wordt opgelost en de gesture al "oud" is).
        video.addEventListener("canplay", () => {
          video.muted = shouldMute;
          video.play().catch(() => {});
        }, { once: true });
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

    const selectedNeedsResolve = usingMediaSource
      && selectedSrc
      && this._isMediaSourceId(selectedSrc)
      && !this._ms.urlCache.has(selectedSrc);

    if (this._prefetchKey === key && !selectedNeedsResolve) return;
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

  _parseRawDateFields(name, format) {
    if (!name || !format) return null;
    try {
      const built = this._buildFilenameDateRegex(format);
      if (!built?.regex || !built?.fields?.length) return null;
      const match = String(name).match(built.regex);
      if (!match) return null;
      const f = { year: null, month: null, day: null, hour: null, minute: null, second: null };
      built.fields.forEach((field, i) => {
        const v = match[i + 1];
        if (v == null) return;
        if (field === "year") f.year = Number(v);
        else if (field === "year2") f.year = 2000 + Number(v);
        else if (field === "month") f.month = Number(v);
        else if (field === "day") f.day = Number(v);
        else if (field === "hour") f.hour = Number(v);
        else if (field === "minute") f.minute = Number(v);
        else if (field === "second") f.second = Number(v);
      });
      return f;
    } catch (_) { return null; }
  }

  _parseFolderFileDatetime(src) {
    const folderFmt = this.config?.folder_datetime_format;
    const fileFmt = this.config?.filename_datetime_format;
    if (!folderFmt) return null;

    // Haal folder- en bestandsnaam-segment op uit het pad
    const raw = String(src || "");
    const parts = raw.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const fileSegment = parts[parts.length - 1].replace(/\.[^./.]+$/, "");
    const folderSegment = parts[parts.length - 2];

    const folderFields = this._parseRawDateFields(folderSegment, folderFmt);
    if (!folderFields) return null;

    const fileFields = fileFmt ? this._parseRawDateFields(fileSegment, fileFmt) : null;

    // Samenvoegen: folder levert datum, bestand levert tijdstip
    const year  = folderFields.year  ?? fileFields?.year  ?? new Date().getFullYear();
    const month = folderFields.month ?? fileFields?.month ?? null;
    const day   = folderFields.day   ?? fileFields?.day   ?? null;
    const hour   = fileFields?.hour   ?? folderFields.hour   ?? 0;
    const minute = fileFields?.minute ?? folderFields.minute ?? 0;
    const second = fileFields?.second ?? folderFields.second ?? 0;

    if (month == null || day == null) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const ms = new Date(year, month - 1, day, hour, minute, second).getTime();
    if (!Number.isFinite(ms)) return null;

    const pad = (n, l = 2) => String(n).padStart(l, "0");
    const dtKey = `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
    return { dayKey: `${pad(year, 4)}-${pad(month)}-${pad(day)}`, dtKey, ms };
  }

  _autoDetectFolderDate(folderSegment) {
    const s = String(folderSegment || "").trim();
    const thisYear = new Date().getFullYear();
    let m;

    // YYYY-MM-DD or YYYY.MM.DD or YYYY_MM_DD
    m = s.match(/^(\d{4})[_\-.](\d{2})[_\-.](\d{2})$/);
    if (m) {
      const year = +m[1], month = +m[2], day = +m[3];
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month, day };
    }

    // DD-MM-YYYY or DD.MM.YYYY or DD_MM_YYYY
    m = s.match(/^(\d{2})[_\-.](\d{2})[_\-.](\d{4})$/);
    if (m) {
      const day = +m[1], month = +m[2], year = +m[3];
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month, day };
    }

    // 8 digits YYYYMMDD
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) {
      const year = +m[1], month = +m[2], day = +m[3];
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month, day };
    }

    // 4 digits: DDMM first (European), fallback MMDD
    m = s.match(/^(\d{2})(\d{2})$/);
    if (m) {
      const a = +m[1], b = +m[2];
      if (b >= 1 && b <= 12 && a >= 1 && a <= 31) return { year: thisYear, month: b, day: a };
      if (a >= 1 && a <= 12 && b >= 1 && b <= 31) return { year: thisYear, month: a, day: b };
    }

    return null;
  }

  _autoDetectFileTime(fileSegment) {
    const s = String(fileSegment || "").trim();
    let m;

    // HH:MM:SS or HH-MM-SS or HH_MM_SS (with optional surrounding chars)
    m = s.match(/(?:^|[^0-9])(\d{2})[:_-](\d{2})[:_-](\d{2})(?:[^0-9]|$)/);
    if (m) {
      const hour = +m[1], minute = +m[2], second = +m[3];
      if (hour <= 23 && minute <= 59 && second <= 59) return { hour, minute, second };
    }

    // Exact 6 digits only (no surrounding digits)
    m = s.match(/^\d{6}$/);
    if (m) {
      const hour = +s.slice(0, 2), minute = +s.slice(2, 4), second = +s.slice(4, 6);
      if (hour <= 23 && minute <= 59 && second <= 59) return { hour, minute, second };
    }

    return null;
  }

  _autoDetectFolderFileDate(src) {
    const parts = String(src || "").split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const fileSegment = parts[parts.length - 1].replace(/\.[^./.]+$/, "");
    const folderSegment = parts[parts.length - 2];

    const dateFields = this._autoDetectFolderDate(folderSegment);
    if (!dateFields) return null;

    const timeFields = this._autoDetectFileTime(fileSegment);
    const { year, month, day } = dateFields;
    const hour   = timeFields?.hour   ?? 0;
    const minute = timeFields?.minute ?? 0;
    const second = timeFields?.second ?? 0;

    const ms = new Date(year, month - 1, day, hour, minute, second).getTime();
    if (!Number.isFinite(ms)) return null;

    const pad = (n, l = 2) => String(n).padStart(l, "0");
    const dtKey = `${pad(year,4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
    return { dayKey: `${pad(year,4)}-${pad(month)}-${pad(day)}`, dtKey, ms };
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
    const allowed = this.config?.live_camera_entities;

    return Object.keys(states)
      .filter((entityId) => entityId.startsWith("camera."))
      .filter((entityId) => {
        const st = states[entityId];
        if (!st) return false;

        const state = String(st.state || "").toLowerCase();
        if (state === "unavailable" || state === "unknown") return false;

        if (allowed?.length > 0 && !allowed.includes(entityId)) return false;

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

  _showPills(duration = 2500) {
    this._pillsVisible = true;
    clearTimeout(this._pillsTimer);
    if (this.config?.persistent_controls) {
      this._pillsTimer = null;
      this.requestUpdate();
      return;
    }
    this._pillsTimer = setTimeout(() => {
      if (!this._showLivePicker && !this.config?.persistent_controls) {
        this._pillsVisible = false;
        this._hamburgerOpen = false;
        this.requestUpdate();
      }
    }, duration);
    this.requestUpdate();
  }

  _showPillsHover() {
    clearTimeout(this._pillsTimer);
    this._pillsTimer = null;
    this._pillsVisible = true;
    this.requestUpdate();
  }

  _hidePillsHover() {
    if (this._showLivePicker || this.config?.persistent_controls) return;
    clearTimeout(this._pillsTimer);
    this._pillsTimer = setTimeout(() => {
      if (!this._showLivePicker) {
        this._pillsVisible = false;
        this._hamburgerOpen = false;
        this.requestUpdate();
      }
    }, 200);
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
      "preview_position",
      "pill_size",
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
      const arr = Array.isArray(listOrSingle) ? listOrSingle : (listOrSingle ? [listOrSingle] : []);
      const out = [];
      const seen = new Set();
      this._customIcons = {}; // Tijdelijke opslag voor custom icons

      for (const item of arr) {
        let name = "";
        let icon = "";

        if (typeof item === "string") {
          name = item.toLowerCase().trim();
        } else if (typeof item === "object" && item !== null) {
          // Voor de syntax: - pakket: mdi:package
          const entries = Object.entries(item);
          if (entries.length > 0) {
            name = entries[0][0].toLowerCase().trim();
            icon = entries[0][1];
          }
        }

        if (!name || seen.has(name)) continue;
        seen.add(name);
        out.push(name);
        if (icon) this._customIcons[name] = icon; // Sla het icon op
        
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
    this._liveCameraListCache = null;
    this.requestUpdate();
  }

  async _ensureLiveCard() {
    const entity = this._getEffectiveLiveCamera();
    if (!entity) {
      this._liveCard = null;
      this._liveCardConfigKey = "";
      return null;
    }

    const key = `webrtc:${entity}`;

    if (this._liveCard && this._liveCardConfigKey === key) {
      this._liveCard.hass = this._hass;
      return this._liveCard;
    }

    await customElements.whenDefined("ha-camera-stream");
    const player = document.createElement("ha-camera-stream");
    player.stateObj = this._hass?.states?.[entity];
    player.hass = this._hass;
    player.muted = true; // start muted zodat autoplay werkt; _syncLiveMuted unmute daarna
    player.controls = false;
    const _liveObjFit1 = this.config?.object_fit || "cover";
    player.style.cssText = `display:block;width:100%;height:100%;margin:0;object-fit:${_liveObjFit1};`;

    this._liveCard = player;
    this._liveCardConfigKey = key;
    return player;
  }

  async _ensureLiveCardFromUrl(url) {
    const key = `stream:${url}`;
    if (this._liveCard && this._liveCardConfigKey === key) {
      return this._liveCard;
    }

    // Sluit bestaande peer connection en WebSocket als die er zijn
    if (this._rtcWebSocket) {
      try { this._rtcWebSocket.close(); } catch (_) {}
      this._rtcWebSocket = null;
    }
    if (this._rtcPeerConnection) {
      try { this._rtcPeerConnection.close(); } catch (_) {}
      this._rtcPeerConnection = null;
    }

    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.setAttribute('muted', '');
    video.playsInline = true;
    video.controls = false;
    const _liveObjFit2 = this.config?.object_fit || "cover";
    video.style.cssText = `display:block;width:100%;height:100%;margin:0;object-fit:${_liveObjFit2};`;

    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      this._rtcPeerConnection = pc;

      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      pc.ontrack = (e) => {
        if (e.streams?.[0]) video.srcObject = e.streams[0];
      };

      // Gebruik WebSocket naar go2rtc — vermijdt CORS problemen met HTTP fetch
      const go2rtcBase = this._getGo2rtcUrl();
      const wsUrl = go2rtcBase.replace(/^http/, "ws") + "/api/webrtc?src=" + encodeURIComponent(url);
      const ws = new WebSocket(wsUrl);
      this._rtcWebSocket = ws;

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("go2rtc WS timeout")), 10000);

        ws.onopen = async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: "webrtc/offer", value: pc.localDescription.sdp }));
          } catch (err) { reject(err); }
        };

        ws.onmessage = async (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === "webrtc/answer") {
              await pc.setRemoteDescription({ type: "answer", sdp: msg.value });
              clearTimeout(timeout);
              resolve();
            } else if (msg.type === "webrtc/candidate") {
              pc.addIceCandidate({ candidate: msg.value, sdpMid: "0" }).catch(() => {});
            } else if (msg.type === "error") {
              clearTimeout(timeout);
              reject(new Error("go2rtc error: " + msg.value));
            }
          } catch (err) { reject(err); }
        };

        ws.onerror = (e) => { clearTimeout(timeout); reject(new Error("go2rtc WS error")); };
        ws.onclose = (e) => { if (e.code !== 1000) { clearTimeout(timeout); reject(new Error("go2rtc WS closed: " + e.code)); } };
      });

      // Stuur ICE candidates door naar go2rtc
      pc.onicecandidate = (e) => {
        if (e.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "webrtc/candidate", value: e.candidate.candidate }));
        }
      };
    } catch (err) {
      console.warn("[CGC] RTSP stream failed:", err);
    }

    this._liveCard = video;
    this._liveCardConfigKey = key;
    return video;
  }

  _getEffectiveLiveCamera() {
    const selected = String(this._liveSelectedCamera || "").trim();
    if (selected) return selected;

    const options = this._getLiveCameraOptions();
    const preferred = String(this.config?.live_camera_entity || "").trim();
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

  _findLiveVideo() {
    const host = this.renderRoot?.querySelector("#live-card-host");
    if (!host) return null;
    const search = (root) => {
      const video = root.querySelector("video");
      if (video) return video;
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) {
          const found = search(el.shadowRoot);
          if (found) return found;
        }
      }
      return null;
    };
    return search(host);
  }

  _parseAspectRatio(val) {
    const map = { "16:9": "16/9", "4:3": "4/3", "1:1": "1/1" };
    return map[val] || "16/9";
  }

  _aspectRatioStorageKey() {
    const id = this._liveSelectedCamera || this.config?.live_camera_entity || this.config?.entities?.[0] || this.config?.media_sources?.[0] || "default";
    return `cgc_aspect_ratio_${id}`;
  }

  _toggleAspectRatio() {
    const cycle = ["16/9", "4/3", "1/1"];
    const next = cycle[(cycle.indexOf(this._aspectRatio) + 1) % cycle.length];
    this._aspectRatio = next;
    try { localStorage.setItem(this._aspectRatioStorageKey(), next); } catch (_) {}
    this.requestUpdate();
  }

  _aspectRatioLabel() {
    const map = { "16/9": "16:9", "4/3": "4:3", "1/1": "1:1" };
    return map[this._aspectRatio] || "16:9";
  }

  _isLiveFullscreen() {
    return this._isLiveActive() && (
      !!document.fullscreenElement ||
      !!document.webkitFullscreenElement ||
      !!this._liveFullscreen
    );
  }

  _resetZoom() {
    this._zoomScale = 1;
    this._zoomPanX = 0;
    this._zoomPanY = 0;
    this._zoomIsPinching = false;
    this._zoomIsPanning = false;
    this._applyZoom();
  }

  _clampZoomPan() {
    const host = this.renderRoot?.querySelector('#live-card-host');
    if (!host) return;
    const maxX = host.offsetWidth * (this._zoomScale - 1) / 2;
    const maxY = host.offsetHeight * (this._zoomScale - 1) / 2;
    this._zoomPanX = Math.max(-maxX, Math.min(maxX, this._zoomPanX));
    this._zoomPanY = Math.max(-maxY, Math.min(maxY, this._zoomPanY));
  }

  _applyZoom() {
    const host = this.renderRoot?.querySelector('#live-card-host');
    if (!host) return;
    if (this._zoomScale <= 1) {
      host.style.transform = '';
      host.style.transformOrigin = '';
    } else {
      host.style.transformOrigin = 'center center';
      host.style.transform = `translate(${this._zoomPanX / this._zoomScale}px, ${this._zoomPanY / this._zoomScale}px) scale(${this._zoomScale})`;
    }
  }

  _toggleLiveMute() {
    const newMuted = !this._liveMuted;
    this._liveMuted = newMuted;
    if (this._liveCard) this._liveCard.muted = newMuted;
    const video = this._findLiveVideo();
    if (video) video.muted = newMuted;
  }

  _toggleLiveFullscreen() {
    const video = this._findLiveVideo();

    // Uitgang fullscreen
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document).catch(() => {});
      return;
    }

    // iOS Safari: webkitEnterFullscreen op video element
    if (video && video.webkitSupportsFullscreen) {
      video.webkitEnterFullscreen();
      return;
    }

    // Standard fullscreen API — altijd op 'this' zodat pinch-zoom werkt
    if (document.fullscreenEnabled) {
      this.requestFullscreen().catch(() => {});
      return;
    }

    // CSS fallback
    this._liveFullscreen = !this._liveFullscreen;
    if (!this._liveFullscreen) this._resetZoom();
    this.toggleAttribute("data-live-fs", this._liveFullscreen);
    this.requestUpdate();
  }

  _openImageFullscreen() {
    this._imgFsOpen = true;
    try { screen.orientation?.lock?.("landscape"); } catch (_) {}
    this._showPills();
    this.requestUpdate();
  }

  _closeImageFullscreen() {
    this._imgFsOpen = false;
    try { screen.orientation?.unlock?.(); } catch (_) {}
    this.requestUpdate();
  }

  _syncCurrentMedia(src) {
    if (!src || src === this._lastSyncedSrc) return;
    this._lastSyncedSrc = src;
    const syncEntity = this.config?.sync_entity;
    if (!syncEntity || !syncEntity.startsWith("input_text.")) return;
    const filename = src.split("/").pop().split("?")[0];
    this._hass?.callService("input_text", "set_value", {
      entity_id: syncEntity,
      value: filename,
    });
  }

  _applyLiveMuteState() {
    const muted = this._liveMuted;
    if (this._liveCard) this._liveCard.muted = muted;
    const video = this._findLiveVideo();
    if (video) {
      video.muted = muted;
    }
    return true;
  }

  _syncLiveMuted() {
    this._applyLiveMuteState();
    // Alleen herhalen voor het unmute-geval: ha-camera-stream reset muted na stream connect
    if (!this._liveMuted) {
      setTimeout(() => this._applyLiveMuteState(), 2000);
      setTimeout(() => this._applyLiveMuteState(), 5000);
    }
  }

  _stopMicStream() {
    if (this._micStream) {
      this._micStream.getTracks().forEach(t => t.stop());
      this._micStream = null;
    }
    if (this._micPeerConnection) {
      try { this._micPeerConnection.close(); } catch (_) {}
      this._micPeerConnection = null;
    }
    if (this._micWebSocket) {
      try { this._micWebSocket.close(); } catch (_) {}
      this._micWebSocket = null;
    }
    this._liveMicActive = false;
  }

  async _toggleMic() {
    if (this._liveMicActive) {
      this._stopMicStream();
      return;
    }

    const streamName = this.config?.live_go2rtc_stream;
    if (!streamName) return;

    try {
      const data = await this._hass.callWS({ type: "auth/sign_path", path: "/api/webrtc/ws" });
      const wsUrl = "ws" + this._hass.hassUrl(data.path).substring(4)
                    + "&url=" + encodeURIComponent(streamName);

      if (!navigator.mediaDevices?.getUserMedia) {
      console.warn("[CGC] Two-way audio requires HTTPS (secure context). Open your dashboard via https://");
      return;
    }
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this._micStream = micStream;

      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      this._micPeerConnection = pc;

      const audioTrack = micStream.getAudioTracks()[0];
      pc.addTransceiver(audioTrack, { direction: "sendrecv" });

      const ws = new WebSocket(wsUrl);
      this._micWebSocket = ws;

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("go2rtc mic WS timeout")), 10000);

        ws.onopen = async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: "webrtc/offer", value: pc.localDescription.sdp }));
          } catch (err) { reject(err); }
        };

        ws.onmessage = async (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === "webrtc/answer") {
              await pc.setRemoteDescription({ type: "answer", sdp: msg.value });
              clearTimeout(timeout);
              resolve();
            } else if (msg.type === "webrtc/candidate") {
              pc.addIceCandidate({ candidate: msg.value, sdpMid: "0" }).catch(() => {});
            } else if (msg.type === "error") {
              clearTimeout(timeout);
              reject(new Error("go2rtc mic error: " + msg.value));
            }
          } catch (err) { reject(err); }
        };

        ws.onerror = () => { clearTimeout(timeout); reject(new Error("go2rtc mic WS error")); };
        ws.onclose = (e) => {
          if (e.code !== 1000) { clearTimeout(timeout); reject(new Error("go2rtc mic WS closed: " + e.code)); }
        };
      });

      pc.onicecandidate = (e) => {
        if (e.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "webrtc/candidate", value: e.candidate.candidate }));
        }
      };

      ws.close(1000);
      this._micWebSocket = null;

      this._liveMicActive = true;

    } catch (err) {
      console.warn("[CGC] Two-way audio failed:", err);
      this._stopMicStream();
    }
  }

  async _mountLiveCard() {
    if (!this._isLiveActive()) return;

    const host = this.renderRoot?.querySelector("#live-card-host");
    if (!host) return;

    const card = await this._ensureLiveCard();
    if (!card) return;

    const isNewMount = card.parentElement !== host;

    if (isNewMount) {
      host.innerHTML = "";
      host.appendChild(card);
    }

    // hass wordt al direct doorgegeven in set hass() — hier alleen stateObj updaten
    const entity = this._getEffectiveLiveCamera();
    const newStateObj = this._hass?.states?.[entity];
    if (newStateObj?.last_changed !== card.stateObj?.last_changed) {
      card.stateObj = newStateObj;
    }

    // Style-injectie alleen bij nieuwe mount (timers + MutationObserver doen de rest)
    if (isNewMount) {
      card.hass = this._hass;
      this._injectLiveFillStyle(card);
      this._liveMuted = this.config?.live_auto_muted !== false;
      this._syncLiveMuted();
    }
  }

  _injectLiveFillStyle(card) {
    const objFit = this.config?.object_fit || "cover";
    const cssFill = `
      :host { display:block!important; width:100%!important; height:100%!important; }
      .image-container { width:100%!important; height:100%!important; }
      .ratio { padding-bottom:0!important; padding-top:0!important; width:100%!important; height:100%!important; position:relative!important; }
      img, video, ha-hls-player, ha-web-rtc-player, ha-camera-stream { width:100%!important; height:100%!important; object-fit:${objFit}!important; display:block!important; position:static!important; }
    `;

    const injectInto = (el) => {
      const sr = el.shadowRoot;
      if (!sr || sr.querySelector("#cgc-fill")) return;
      const s = document.createElement("style");
      s.id = "cgc-fill";
      s.textContent = cssFill;
      sr.appendChild(s);
      // Fix het padding-bottom ratio-hack als die bestaat (hui-image)
      const ratio = sr.querySelector(".ratio");
      if (ratio) ratio.style.setProperty("padding-bottom", "0", "important");
    };

    // Injecteer in de card zelf
    injectInto(card);

    // Injecteer ook recursief in geneste shadow roots (hui-image, ha-web-rtc-player, etc.)
    const injectDeep = (root) => {
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) {
          injectInto(el);
          injectDeep(el.shadowRoot);
        }
      }
    };

    const tryInject = () => {
      const sr = card.shadowRoot;
      if (!sr) return false;
      injectDeep(sr);
      return true;
    };

    if (!tryInject()) {
      const obs = new MutationObserver(() => {
        if (tryInject()) obs.disconnect();
      });
      obs.observe(card.shadowRoot || card, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 5000);
    }

    // Herhaal na 2s voor lazy-rendered interne elementen
    setTimeout(() => {
      if (card.shadowRoot) injectDeep(card.shadowRoot);
    }, 2000);
  }

  _openLivePicker() {
    if (this._getLiveCameraOptions().length <= 1) return;
    this._liveCameraListCache = this._getLiveCameraOptions();
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

        ${this._renderLivePicker()}
      </div>
    `;
  }

  _renderLivePicker() {
    const cams = this._liveCameraListCache || this._getLiveCameraOptions();
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
                  <div class="live-picker-item-name">
                    <span>${this._friendlyCameraName(cam)}</span>
                    <span class="live-picker-item-entity">${cam}</span>
                  </div>
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

    const defaultRatio = this._parseAspectRatio(this.config?.aspect_ratio);
    const stored = (() => { try { return localStorage.getItem(`cgc_aspect_ratio_${next}`); } catch (_) { return null; } })();
    this._aspectRatio = ["16/9", "4/3", "1/1"].includes(stored) ? stored : defaultRatio;

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

    if (mode === "live" && navigator.maxTouchPoints > 0) {
      this._showPills(5000);
    }

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

  _onPreviewClick(e) {
    if (!this._isLiveActive()) return;

    const path = e.composedPath?.() || [];
    if (
      this._pathHasClass(path, "live-picker") ||
      this._pathHasClass(path, "live-picker-backdrop") ||
      this._pathHasClass(path, "live-quick-switch")
    ) return;

    if (this._hamburgerOpen && !this._pathHasClass(path, "live-hamburger-wrap")) {
      this._hamburgerOpen = false;
      return;
    }

    this._showLiveQuickSwitchButton();
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
        aria-label="Thumbnail actions"
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
    return "media-source://frigate/frigate/event-search/snapshots";
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

    const videoName = (src.split("/").pop() || "").toLowerCase();
    const videoStem = videoName.replace(/\.(mp4|webm|mov|m4v)$/i, "");

    if (!videoStem) {
      this._snapshotCache.set(src, "");
      return "";
    }

    const snapshots = Array.isArray(this._frigateSnapshots)
      ? this._frigateSnapshots
      : [];

    if (!snapshots.length) {
      this._snapshotCache.set(src, "");
      return "";
    }

    let match = snapshots.find((snap) => {
      const snapName =
        String(snap?.id || "").split("/").pop()?.toLowerCase() || "";
      const snapStem = snapName.replace(/\.(jpg|jpeg|png|webp)$/i, "");
      return snapStem === videoStem;
    });

    if (!match) {
      match = snapshots.find((snap) =>
        String(snap?.id || "").toLowerCase().includes(videoStem)
      );
    }

    if (!match) {
      const videoMs = this._dtMsFromSrc(src);

      if (Number.isFinite(videoMs)) {
        let best = null;
        let bestDiff = Infinity;

        for (const snap of snapshots) {
          const snapMs = Number(snap?.dtMs);
          if (!Number.isFinite(snapMs)) continue;

          const diff = Math.abs(snapMs - videoMs);
          if (diff < bestDiff) {
            best = snap;
            bestDiff = diff;
          }
        }

        if (best && bestDiff <= 15000) {
          match = best;
        }
      }
    }

    const result = match?.id || "";
    this._snapshotCache.set(src, result);
    return result;
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
      v.setAttribute('muted', '');
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

      const timeout = setTimeout(() => fail(new Error("poster timeout")), 5000);
      const origFail = fail;
      const origDraw = draw;
      // Override fail/draw to also clear the timeout
      const failOnce = (err) => { clearTimeout(timeout); origFail(err); };
      const drawOnce = () => { clearTimeout(timeout); origDraw(); };

      v.addEventListener("error", () => failOnce(new Error("video load error")), { once: true });
      v.addEventListener(
        "loadedmetadata",
        () => {
          try {
            v.currentTime = 0.01;
          } catch (_) {
            drawOnce();
          }
        },
        { once: true }
      );
      v.addEventListener("seeked", () => drawOnce(), { once: true });

      v.src = src;
      try {
        v.load();
      } catch (_) {}
    });
  }

  _thumbHash(url) {
    let h = 2166136261;
    for (let i = 0; i < url.length; i++) {
      h ^= url.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return "cgc_p_" + h.toString(36);
  }

  _lsThumbGet(url) {
    try {
      return localStorage.getItem(this._thumbHash(url)) || null;
    } catch (_) { return null; }
  }

  _lsThumbSet(url, dataUrl) {
    try {
      const key = this._thumbHash(url);
      const indexKey = "cgc_poster_index";
      const index = JSON.parse(localStorage.getItem(indexKey) || "[]");
      // Evict oldest entries if over limit (max 150)
      if (index.length >= 150) {
        const toRemove = index.splice(0, index.length - 149);
        toRemove.forEach((k) => { try { localStorage.removeItem(k); } catch (_) {} });
      }
      if (!index.includes(key)) index.push(key);
      localStorage.setItem(indexKey, JSON.stringify(index));
      localStorage.setItem(key, dataUrl);
    } catch (_) {}
  }

  async _ensurePoster(src) {
    if (!src || this._posterCache.has(src) || this._posterPending.has(src)) {
      return;
    }
    // Check persistent localStorage cache first
    const cached = this._lsThumbGet(src);
    if (cached) {
      this._posterCache.set(src, cached);
      this.requestUpdate();
      return;
    }
    this._posterPending.add(src);
    try {
      let dataUrl = null;
      // HA relative image URLs (thumbnails from browse_media) need auth — fetch directly.
      // Video files (sensor mode) must use _captureFirstFrame regardless of path format.
      if (src.startsWith("/") && !this._isVideo(src)) {
        const token = this._hass?.auth?.data?.access_token;
        if (token) {
          const res = await fetch(window.location.origin + src, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const blob = await res.blob();
            dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
        }
      } else {
        dataUrl = await this._captureFirstFrame(src);
      }
      if (dataUrl) {
        this._posterCache.set(src, dataUrl);
        this._lsThumbSet(src, dataUrl);
      }
    } catch (_) {
    } finally {
      this._posterPending.delete(src);
      this.requestUpdate();
    }
  }

  // ─── Media source ─────────────────────────────────────────────────

  async _msBrowse(rootId) {
    const cached = this._msBrowseTtlCache.get(rootId);
    if (cached && Date.now() - cached.ts < 60 * 60 * 1000) return cached.data;
    const isReolink = String(rootId || "").startsWith("media-source://reolink/");
    const timeout = isReolink ? 60000 : DEFAULT_BROWSE_TIMEOUT_MS;
    const data = await this._wsWithTimeout({
      type: "media_source/browse_media",
      media_content_id: rootId,
    }, timeout);
    this._msBrowseTtlCache.set(rootId, { ts: Date.now(), data });
    return data;
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
    const fresh = sameKey && now - (this._ms.loadedAt || 0) < 300_000;

    if (this._ms.loading || fresh) return;

    if (!sameKey) {
      this._ms.key = key;
      this._ms.list = [];
      this._ms.roots = roots.slice();
      this._ms.urlCache = new Map();
    }

    // Serve from persistent walk cache instantly, then refresh in background
    const walkedCache = this._msWalkCacheLoad(key);
    if (walkedCache && walkedCache.length > 0) {
      this._ms.list = walkedCache;
      this._ms.loadedAt = Date.now();
      this.requestUpdate();
      // If cache is older than 5 minutes, refresh in background
      try {
        const raw = localStorage.getItem(this._msWalkCacheKey(key));
        const entry = raw ? JSON.parse(raw) : null;
        if (!entry || Date.now() - entry.ts > 5 * 60 * 1000) {
          setTimeout(() => this._msEnsureLoaded(), 0);
        }
      } catch (_) {}
      return;
    }

    this._ms.loading = true;

    try {
      const visibleCap = this._normMaxMedia(this.config?.max_media);
      const isFrigateRoot = roots.some((r) =>
        String(r).includes("media-source://frigate/")
      );

      const internalCap = isFrigateRoot
        ? Math.min(400, Math.max(visibleCap * 4, 200))
        : Math.min(300, Math.max(visibleCap * 4, 80));

      const walkLimitTotal = isFrigateRoot
        ? Math.min(800, Math.max(internalCap * 2, 400))
        : Math.min(400, Math.max(Math.ceil(internalCap * 1.5), internalCap + 20));
      const perRootLimit = Math.max(
        DEFAULT_PER_ROOT_MIN_LIMIT,
        Math.ceil(walkLimitTotal / roots.length)
      );

      const flat = [];

      const rootResults = await Promise.all(
        roots.map(async (root) => {
          try {
            const rootStr = String(root);
            const isLocalRoot = rootStr.includes("media_source/local/");
            const isFrigateRoot = rootStr.includes("media-source://frigate/");
            const isReolinkRoot = rootStr.includes("media-source://reolink/");

            const depthLimit = isFrigateRoot
              ? 3
              : isReolinkRoot
                ? 4
                : isLocalRoot
                  ? Math.min(6, DEFAULT_WALK_DEPTH)
                  : DEFAULT_WALK_DEPTH;

            // For single-root: progressively show first items while the rest loads
            const onProgress = roots.length === 1
              ? (partial) => {
                  if (partial.length >= 1) {
                    this._ms.list = partial
                      .filter((x) => !!x?.media_content_id)
                      .map((x) => ({
                        cls: String(x.media_class || ""),
                        id: String(x.media_content_id || ""),
                        mime: String(x.mime_type || ""),
                        title: String(x.title || ""),
                        thumb: String(x.thumbnail || ""),
                      }))
                      .filter((x) => !!x.id)
                      .slice(0, internalCap);
                    this.requestUpdate();
                  }
                }
              : null;

            return await this._msWalkIter(root, perRootLimit, depthLimit, onProgress);
          } catch (e) {
            console.warn("MS root failed:", root, e);
            return [];
          }
        })
      );
      flat.push(...rootResults.flat());

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
              thumb: String(x.thumbnail || ""),
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
          thumb: String(x.thumbnail || ""),
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
      this._msWalkCacheSave(key, this._ms.list);
    } catch (e) {
      console.warn("MS ensure load failed:", e);
      console.warn("MS roots used:", roots);
      this._ms.list = [];
    } finally {
      this._ms.loading = false;
      this.requestUpdate();
    }
  }

  _msWalkCacheKey(key) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return "cgc_mswalk_" + h.toString(36);
  }

  _msWalkCacheSave(key, list) {
    try {
      localStorage.setItem(this._msWalkCacheKey(key), JSON.stringify({ ts: Date.now(), list }));
    } catch (_) {}
  }

  _msWalkCacheLoad(key, maxAgeMs = 30 * 60 * 1000) {
    try {
      const raw = localStorage.getItem(this._msWalkCacheKey(key));
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!Array.isArray(entry?.list) || Date.now() - entry.ts > maxAgeMs) return null;
      return entry.list;
    } catch (_) { return null; }
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
    if (!it) return { cls: "", mime: "", title: "", thumb: "" };
    return { cls: it.cls || "", mime: it.mime || "", title: it.title || "", thumb: it.thumb || "" };
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

    const isReolink = String(mediaId || "").startsWith("media-source://reolink/");
    const resolveTimeout = isReolink ? 60000 : 12000;

    const r = await this._wsWithTimeout(
      {
        type: "media_source/resolve_media",
        media_content_id: mediaId,
        expires: 60 * 60,
      },
      resolveTimeout
    );

    const url = r?.url ? String(r.url) : "";
    if (url) this._ms.urlCache.set(mediaId, url);
    return url;
  }

  _msTitleById(id) {
    const it = (this._ms?.list || []).find((x) => x.id === id);
    return it?.title || "";
  }

  async _msWalkIter(rootId, limit, depthLimit, onProgress = null) {
    const BATCH = 20;
    const out = [];
    const stack = [{ depth: 0, id: rootId }];

    while (stack.length && out.length < limit) {
      const prevCount = out.length;

      // Pop a batch and browse in parallel
      const batch = [];
      while (stack.length && batch.length < BATCH) {
        const item = stack.pop();
        if (item && item.depth <= depthLimit) batch.push(item);
      }
      if (!batch.length) break;

      const results = await Promise.all(
        batch.map(async ({ depth, id }) => {
          try {
            return { depth, node: await this._msBrowse(id) };
          } catch (_) {
            return { depth, node: null };
          }
        })
      );

      for (const { depth, node } of results) {
        if (!node) continue;

        const children = Array.isArray(node?.children) ? node.children : [];

        if (!children.length) {
          if (node?.media_content_id) {
            const ok = !!node?.can_play || this._msIsRenderable(
              node?.mime_type,
              node?.media_class,
              node?.title
            );
            if (ok && out.length < limit) out.push(node);
          }
          continue;
        }

        for (let i = children.length - 1; i >= 0; i--) {
          if (out.length >= limit) break;

          const ch = children[i];
          const mid = String(ch?.media_content_id || "");
          if (!mid) continue;

          const canExpand = !!ch?.can_expand;
          const canPlay = !!ch?.can_play;
          const cls = String(ch?.media_class || "").toLowerCase();

          if (canExpand || (!canPlay && cls === "directory")) {
            stack.push({ depth: depth + 1, id: mid });
          } else if (canPlay || this._msIsRenderable(ch?.mime_type, ch?.media_class, ch?.title)) {
            out.push(ch);
          }
        }
      }

      if (onProgress && out.length > prevCount) onProgress([...out]);
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
    if (String(src || "").startsWith("media-source://reolink/")) {
      const seg = src.split("/").pop();
      const parts = (seg || "").split("|");
      const ts = parts[1];
      if (ts && /^\d{14}$/.test(ts)) {
        const yr = +ts.slice(0,4), mo = +ts.slice(4,6), dy = +ts.slice(6,8);
        const hr = +ts.slice(8,10), mn = +ts.slice(10,12), sc = +ts.slice(12,14);
        return new Date(yr, mo - 1, dy, hr, mn, sc).getTime();
      }
    }

    const folderFile = this._parseFolderFileDatetime(src);
    if (folderFile?.ms != null) return folderFile.ms;

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

    const pathDtKey = (() => {
      const m = String(src || "").match(/\/(\d{8})\/(\d{6})\./);
      if (!m) return null;
      return `${m[1].slice(0,4)}-${m[1].slice(4,6)}-${m[1].slice(6,8)}T${m[2].slice(0,2)}:${m[2].slice(2,4)}:${m[2].slice(4,6)}`;
    })();

    if (pathDtKey) {
      const ms = new Date(pathDtKey).getTime();
      if (Number.isFinite(ms)) return ms;
    }

    const autoFolder = this._autoDetectFolderFileDate(src);
    if (autoFolder?.ms != null) return autoFolder.ms;

    return NaN;
  }

  _extractDateTimeKey(src) {
    const folderFile = this._parseFolderFileDatetime(src);
    if (folderFile?.dtKey) return folderFile.dtKey;

    const custom = this._parseDateFromFilename(
      src,
      this.config?.filename_datetime_format
    );
    if (custom?.dtKey) return custom.dtKey;

    const ymd = this._extractYmdHms(src);
    if (ymd?.dtKey) return ymd.dtKey;

    const autoFolder = this._autoDetectFolderFileDate(src);
    if (autoFolder?.dtKey) return autoFolder.dtKey;

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
    const folderFile = this._parseFolderFileDatetime(src);
    if (folderFile?.dayKey) return folderFile.dayKey;

    const custom = this._parseDateFromFilename(
      src,
      this.config?.filename_datetime_format
    );
    if (custom?.dayKey) return custom.dayKey;

    const ymd = this._extractYmdHms(src);
    if (ymd?.dayKey) return ymd.dayKey;

    const autoFolder = this._autoDetectFolderFileDate(src);
    if (autoFolder?.dayKey) return autoFolder.dayKey;

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
      } else {
        wrap.scrollLeft = 0;
        try {
          wrap.scrollTo({ behavior: "auto", left: 0 });
        } catch (_) {}
      }

      // Herstart observer na scroll reset zodat zichtbare elementen
      // correct worden gedetecteerd op de nieuwe scroll positie
      this._observedThumbs = new WeakSet();
      this._setupThumbObserver();
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

  _objectColor(obj) {
    const colors = this.config?.object_colors;
    if (obj && colors && typeof colors === "object" && colors[obj]) {
      return colors[obj];
    }
    return "currentColor";
  }

  _objectForSrc(src) {
      const key = String(src || "").trim();
      if (!key) return null;
      if (this._objectCache.has(key)) return this._objectCache.get(key);

      let detected = null;
      
      const activeFilters = this._getVisibleObjectFilters();
      
      let sourceText = "";
      if (this.config?.source_mode === "sensor") {
        const sourceEntity = this._srcEntityMap?.get(src) || "";
        const sensorStateObj = sourceEntity ? this._hass?.states?.[sourceEntity] : null;
        sourceText = [this._itemFilenameForFilter(src), this._sensorTextForFilter(sourceEntity, sensorStateObj)].join(" ");
      } else {
        const meta = this._msMetaById(src);
        sourceText = [meta?.title, src].join(" ");
      }
      sourceText = sourceText.toLowerCase();

      for (const filter of activeFilters) {
        const aliases = this._getFilterAliases(filter);
        if (aliases.some(alias => sourceText.includes(alias))) {
          detected = filter;
          break;
        }
      }

      this._objectCache.set(key, detected);
      return detected;
    }

  _objectIcon(obj) {
      if (!obj) return "";
      
      if (this._customIcons && this._customIcons[obj]) {
        return this._customIcons[obj];
      }

      const icons = {
        bicycle: "mdi:bicycle",
        bird: "mdi:bird",
        bus: "mdi:bus",
        car: "mdi:car",
        cat: "mdi:cat",
        dog: "mdi:dog",
        motorcycle: "mdi:motorbike",
        person: "mdi:account",
        truck: "mdi:truck",
        visitor: "mdi:doorbell-video",
      };

      return icons[obj] || "mdi:magnify"; 
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
    this._showPills();
  }

  _navPrev() {
    if (this._selectMode || this._isLiveActive()) return;
    const i = this._selectedIndex ?? 0;
    if (i <= 0) return;
    this._selectedIndex = i - 1;
    this._pendingScrollToI = this._selectedIndex;
    this.requestUpdate();
    this._showNavChevrons();
    this._showPills();
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
    this._swipeCurX = e.clientX;
    this._swipeCurY = e.clientY;

    try {
      e.currentTarget?.setPointerCapture?.(e.pointerId);
    } catch (_) {}
  }

  _getThumbRenderLimit(cap, usingMediaSource) {
    return cap;
  }

  _onPreviewPointerUp(e, listLen) {
    if (this._isLiveActive()) {
      this._swiping = false;
      this._showPills();
      return;
    }

    if (!this._swiping) {
      if (this.config?.preview_click_to_open && !this._previewOpen) return;
      if (this._selectMode) return;
      this._showNavChevrons();
      this._showPills();
      return;
    }

    this._swiping = false;

    if (this.config?.preview_click_to_open && !this._previewOpen) return;

    const endX = (e.clientX !== 0 || e.clientY !== 0) ? e.clientX : this._swipeCurX;
    const endY = (e.clientX !== 0 || e.clientY !== 0) ? e.clientY : this._swipeCurY;
    const dx = endX - this._swipeStartX;
    const dy = endY - this._swipeStartY;

    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      this._showNavChevrons();
      this._showPills();
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
    this._showPills();
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

    this._thumbWheelAccum = (this._thumbWheelAccum || 0) + step;

    if (!this._thumbWheelRaf) {
      this._thumbWheelRaf = requestAnimationFrame(() => {
        this._thumbWheelRaf = null;
        const accumulated = this._thumbWheelAccum || 0;
        this._thumbWheelAccum = 0;
        const maxSc = el.scrollWidth - el.clientWidth;
        el.scrollLeft = Math.max(0, Math.min(maxSc, el.scrollLeft + accumulated));
      });
    }
  }

  // ─── Lifecycle / config ───────────────────────────────────────────

  setConfig(config) {
    const prevConfig = this.config ? { ...this.config } : null;

    const autoplay =
      config.autoplay !== undefined
        ? !!config.autoplay
        : DEFAULT_AUTOPLAY;

    const auto_muted =
      config.auto_muted !== undefined
        ? !!config.auto_muted
        : DEFAULT_AUTOMUTED;

    const live_auto_muted =
      config.live_auto_muted !== undefined
        ? !!config.live_auto_muted
        : DEFAULT_LIVE_AUTO_MUTED;

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

    const live_camera_entities = Array.isArray(config.live_camera_entities)
      ? config.live_camera_entities.map(String).map((s) => s.trim()).filter(Boolean)
      : [];

    const style_variables = String(config.style_variables || "").trim();

    const object_fit = config.object_fit === "contain" ? "contain" : "cover";

    const pill_size = Math.max(10, Math.min(28, num(config.pill_size, 14)));

    const nextConfig = {
      autoplay,
      auto_muted,
      live_auto_muted,
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
      live_camera_entities,
      live_camera_entity,
      live_enabled,
      max_media,
      media_source: source_mode === "media" ? mediaRaw : "",
      media_sources: source_mode === "media" ? normalizedMediaRoots : [],
      object_colors: (typeof config.object_colors === "object" && config.object_colors !== null) ? config.object_colors : {},
      object_filters: visibleObjectFilters,
      preview_click_to_open,
      preview_close_on_tap,
      preview_position,
      aspect_ratio: ["16:9", "4:3", "1:1"].includes(config.aspect_ratio) ? config.aspect_ratio : "16:9",
      source_mode,
      start_mode: config.start_mode === "live" ? "live" : "gallery",
      style_variables,
      object_fit,
      persistent_controls: config.persistent_controls === true,
      pill_size,
      thumb_bar_position,
      thumb_layout,
      thumb_size,
      live_go2rtc_stream: String(config.live_go2rtc_stream || "").trim() || null,
      folder_datetime_format: String(config.folder_datetime_format || "").trim() || null,
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

    const liveEntityChanged = !prevConfig || prevConfig.live_camera_entity !== live_camera_entity;
    if (liveEntityChanged) {
      const liveOptions = this._getAllLiveCameraEntities();
      const validSelected =
        this._liveSelectedCamera &&
        liveOptions.some((x) => x === this._liveSelectedCamera);
      if (!validSelected && liveOptions.length > 0) {
        this._liveSelectedCamera =
          (live_camera_entity && liveOptions.includes(live_camera_entity)
            ? live_camera_entity
            : liveOptions[0]) || "";
      }
      if (prevConfig) {
        const defaultRatio = this._parseAspectRatio(config.aspect_ratio);
        const stored = (() => { try { return localStorage.getItem(this._aspectRatioStorageKey()); } catch (_) { return null; } })();
        this._aspectRatio = ["16/9", "4/3", "1/1"].includes(stored) ? stored : defaultRatio;
      }
    }

    if (!prevConfig) {
      this._previewOpen = this.config.preview_click_to_open ? false : true;
      this._showLivePicker = false;
      this._showLiveQuickSwitch = false;
      const defaultRatio = this._parseAspectRatio(config.aspect_ratio);
      const stored = (() => { try { return localStorage.getItem(this._aspectRatioStorageKey()); } catch (_) { return null; } })();
      this._aspectRatio = ["16/9", "4/3", "1/1"].includes(stored) ? stored : defaultRatio;
      const hasMedia = nextConfig.entities.length > 0 || nextConfig.media_sources.length > 0;
      const startMode = nextConfig.start_mode;
      if (startMode === "live" && nextConfig.live_enabled && nextConfig.live_camera_entity) {
        this._viewMode = "live";
      } else if (startMode === "gallery") {
        this._viewMode = "media";
      } else {
        this._viewMode =
          nextConfig.live_enabled && nextConfig.live_camera_entity && !hasMedia
            ? "live"
            : "media";
      }
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
      this._revealedThumbs.clear();
      if (this._thumbObserver) {
        this._thumbObserver.disconnect();
        this._thumbObserver = null;
        this._thumbObserverRoot = null;
        this._observedThumbs = new WeakSet();
      }
    } else if (this._pendingScrollToI != null) {
      const i = this._pendingScrollToI;
      this._pendingScrollToI = null;
      this._scrollThumbIntoView(i);
    }

    if (this.config?.source_mode === "media") {
      this._msEnsureLoaded();
    }

    if (changedProps.has("config") && this._previewVideoEl) {
      this._previewVideoEl.autoplay = this.config?.autoplay === true;
      this._previewVideoEl.muted =
        this.config?.auto_muted !== undefined
          ? this.config.auto_muted === true
          : true;
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
      this._syncCurrentMedia(selected);

      this._scheduleVisibleMediaWork(selected, filtered, idx, usingMediaSource);

      const visibleThumbSlice = filtered.slice(0, thumbRenderLimit);
      const posterWorkSlice = filtered.slice(
        0,
        Math.min(filtered.length, thumbRenderLimit + 6)
      );

      this._queueSnapshotResolveForVisibleThumbs(visibleThumbSlice);
      this._queueSensorPosterWork(posterWorkSlice);
    }

    if (this._isLiveActive()) {
      this._mountLiveCard();
    } else {
      this._syncPreviewPlaybackFromState();
    }

    this._setupThumbObserver();
  }

  _setupThumbObserver() {
    const scrollEl = this.shadowRoot?.querySelector(".tthumbs");
    if (!scrollEl) return;

    if (this._thumbObserver && this._thumbObserverRoot !== scrollEl) {
      this._thumbObserver.disconnect();
      this._thumbObserver = null;
      this._thumbObserverRoot = null;
      this._observedThumbs = new WeakSet();
    }

    if (!this._thumbObserver) {
      this._thumbObserverRoot = scrollEl;
      const isHorizontal = scrollEl.classList.contains("horizontal");
      const margin = isHorizontal ? "0px 200px 0px 200px" : "200px 0px 200px 0px";

      this._thumbObserver = new IntersectionObserver(
        (entries) => {
          let changed = false;
          const isSensor = this.config?.source_mode === "sensor";
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const key = entry.target.dataset.lazySrc;
              if (key && !this._revealedThumbs.has(key)) {
                this._revealedThumbs.add(key);
                changed = true;
              }
              // Viewport-aware poster prioritization: enqueue only when visible
              if (isSensor && key && this._isVideo(key)) {
                this._enqueuePoster(key);
              }
            }
          }
          if (changed) this.requestUpdate();
        },
        { root: scrollEl, rootMargin: margin, threshold: 0 }
      );
    }

    scrollEl.querySelectorAll(".tthumb[data-lazy-src]").forEach((el) => {
      if (!this._observedThumbs.has(el)) {
        this._thumbObserver.observe(el);
        this._observedThumbs.add(el);
      }
    });
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

    const tsPosClass = this._isLiveActive()
      ? "bottom"
      : this.config.bar_position === "bottom"
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

    // DIT IS DE BELANGRIJKE LOGICA: 
    // showGalleryControls is TRUE als we de gallery/navigatie MOETEN zien.
    // showGalleryControls is FALSE als click_to_open aan staat én de preview open is.
    const showGalleryControls = !this.config?.preview_click_to_open || !this._previewOpen;

    const rootVars = `
      --gap:10px; --r:10px;
      --barOpacity:${this.config.bar_opacity};
      --thumbRowH:${this.config.thumb_size}px;
      --thumbEmptyH:${this.config.thumb_size}px;
      --topbarMar:${STYLE.topbar_margin};
      --topbarPad:${STYLE.topbar_padding};
      --thumbsMaxHeight:320px;
      --cgc-object-fit:${this.config.object_fit || "cover"};
      --cgc-pill-size:${this.config.pill_size}px;
      ${this.config.style_variables || ""}
    `;

    const previewBlock = showPreviewSection
      ? html`
          <div
            class="preview"
            style="aspect-ratio:${this._aspectRatio || "16/9"}; touch-action:${isLive ? "auto" : "pan-y"};"
            @pointerdown=${(e) => {
              if (e?.isPrimary === false) return;
              const path = e.composedPath?.() || [];
              
              // De check op _isInsideTsbar(e) vangt nu ook de nieuwe terugknop af
              const isOnControls =
                this._isLiveActive() ||
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
                try { e.currentTarget?.blur?.(); } catch (_) {}
              }
              this._onPreviewPointerDown(e);
            }}
            @pointermove=${(e) => { if (this._swiping && e.isPrimary !== false) { this._swipeCurX = e.clientX; this._swipeCurY = e.clientY; } }}
            @pointerup=${(e) => this._onPreviewPointerUp(e, filtered.length)}
            @pointercancel=${(e) => this._onPreviewPointerUp(e, filtered.length)}
            @pointerenter=${(e) => { if (e.pointerType === "mouse") this._showPillsHover(); }}
            @pointerleave=${(e) => { if (e.pointerType === "mouse") this._hidePillsHover(); }}
            @click=${(e) => this._onPreviewClick(e)}
          >
            ${isLive
              ? this._renderLiveInner()
              : noResultsForFilter
                ? html`<div class="preview-empty">No media for this day.</div>`
                : !selectedHasUrl
                  ? html`<div class="empty inpreview">Loading...</div>`
                  : selectedIsVideo
                    ? html`<div id="preview-video-host" class="preview-video-host"></div>`
                    : html`<img class="pimg" src=${selectedUrl} alt="" />`}

            ${!noResultsForFilter && !isLive && filtered.length > 1 && this._showNav ? html`
              <div class="pnav">
                <button class="pnavbtn left" ?disabled=${idx <= 0} @click=${(e) => { e.stopPropagation(); this._navPrev(); }}>
                  <ha-icon icon="mdi:chevron-left"></ha-icon>
                </button>
                <button class="pnavbtn right" ?disabled=${idx >= filtered.length - 1} @click=${(e) => { e.stopPropagation(); this._navNext(filtered.length); }}>
                  <ha-icon icon="mdi:chevron-right"></ha-icon>
                </button>
              </div>
            ` : html``}

            ${!isLive && tsPosClass !== "hidden" ? html`
              <div class="gallery-pills ${tsPosClass} ${this._pillsVisible || this.config?.persistent_controls ? "visible" : ""}">
                ${previewGated && previewOpen ? html`
                  <button class="gallery-pill live-pill-btn" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._setViewMode("media"); this._previewOpen = false; this.requestUpdate(); }}>
                    <ha-icon icon="mdi:arrow-left"></ha-icon>
                  </button>
                ` : html``}
                ${(() => {
                  const obj = this._objectForSrc(selected);
                  const icon = obj ? this._objectIcon(obj) : null;
                  if (!icon) return html``;
                  return html`<div class="gallery-pill live-pill-btn" style="flex-shrink:0;width:calc(var(--cgc-pill-size,14px)*1.6 + 2px);height:calc(var(--cgc-pill-size,14px)*1.6 + 2px);padding:0"><ha-icon icon="${icon}"></ha-icon></div>`;
                })()}
                <div class="gallery-pill live-pill-btn" style="flex-shrink:0;width:calc(var(--cgc-pill-size,14px)*1.6 + 2px);height:calc(var(--cgc-pill-size,14px)*1.6 + 2px);padding:0;overflow:hidden"><span style="font-size:calc(var(--cgc-pill-size,14px) - 6px)">${idx + 1}/${filtered.length}</span></div>
                ${!selectedIsVideo && selectedHasUrl && !noResultsForFilter ? html`
                  <button class="gallery-pill live-pill-btn" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._openImageFullscreen(); }}>
                    <ha-icon icon="mdi:fullscreen"></ha-icon>
                  </button>
                ` : html``}
              </div>
            ` : isLive ? html`
              <div class="live-controls-bar ${this._pillsVisible || this._showLivePicker || this.config?.persistent_controls ? "visible" : ""}">
                <div class="live-pills-left">
                  <div class="gallery-pill"><span>${this._friendlyCameraName(this._getEffectiveLiveCamera())}</span></div>
                </div>
                <div class="live-pills-right">
                  <button class="gallery-pill live-pill-btn" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._toggleAspectRatio(); }}>
                    <span>${this._aspectRatioLabel()}</span>
                  </button>
                  ${this.config?.live_go2rtc_stream ? html`
                    <button class="gallery-pill live-pill-btn ${this._liveMicActive ? "active" : ""}" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._toggleMic(); }}>
                      <ha-icon icon=${this._liveMicActive ? "mdi:microphone" : "mdi:microphone-off"}></ha-icon>
                    </button>
                  ` : html``}
                  <button class="gallery-pill live-pill-btn" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._toggleLiveMute(); }}>
                    <ha-icon icon=${this._liveMuted ? "mdi:volume-off" : "mdi:volume-high"}></ha-icon>
                  </button>
                  ${this._getLiveCameraOptions().length > 1 ? html`
                    <button class="gallery-pill live-pill-btn" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._openLivePicker(); }}>
                      <ha-icon icon="mdi:cctv"></ha-icon>
                    </button>
                  ` : html``}
                  <button class="gallery-pill live-pill-btn" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._toggleLiveFullscreen(); }}>
                    <ha-icon icon=${document.fullscreenElement || document.webkitFullscreenElement || this._liveFullscreen ? "mdi:fullscreen-exit" : "mdi:fullscreen"}></ha-icon>
                  </button>
                  <div class="live-hamburger-wrap" @pointerdown=${(e) => e.stopPropagation()}>
                    <button class="gallery-pill live-pill-btn" @click=${(e) => { e.stopPropagation(); this._hamburgerOpen = !this._hamburgerOpen; }}>
                      <ha-icon icon="mdi:menu"></ha-icon>
                    </button>
                    ${this._hamburgerOpen ? html`
                      <div class="live-hamburger-menu">
                        <button class="gallery-pill live-pill-btn"><ha-icon icon="mdi:circle-outline"></ha-icon></button>
                        <button class="gallery-pill live-pill-btn"><ha-icon icon="mdi:circle-outline"></ha-icon></button>
                        <button class="gallery-pill live-pill-btn"><ha-icon icon="mdi:circle-outline"></ha-icon></button>
                      </div>
                    ` : html``}
                  </div>
                </div>
              </div>
            ` : html``}
          </div>
        `
      : html``;

    const objectFiltersBlock = visibleObjectFilters.length
      ? html`
          <div class="objfilters" role="group" aria-label="Object filters">
            ${visibleObjectFilters.map((filterValue) => {
              const objIcon = this._objectIcon(filterValue);
              const label = this._filterLabel(filterValue);
              const objColor = this._objectColor(filterValue);
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
                    ? html`<ha-icon icon="${objIcon}" style="color:${objColor}"></ha-icon>`
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
                    let tThumb = "";
                    if (isMs) {
                      const meta = this._msMetaById(it.src);
                      tMime = meta.mime;
                      tCls = meta.cls;
                      tTitle = meta.title;
                      tThumb = meta.thumb;
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

                          if (snapshotId) {
                            snapshotUrl = this._ms?.urlCache?.get(snapshotId) || "";

                            if (!snapshotUrl) {
                              this._msQueueResolve([snapshotId]);
                            }
                          }
                        }

                        if (snapshotUrl) {
                          poster = snapshotUrl;
                        } else if (tThumb) {
                          poster = this._posterCache.get(tThumb) || "";
                          if (!poster && tThumb !== selectedUrl) this._enqueuePoster(tThumb);
                        } else if (thumbUrl) {
                          poster = this._posterCache.get(thumbUrl) || "";
                          // Sla poster-capture over voor de geselecteerde video: die laadt
                          // al als preview. Gelijktijdig laden van dezelfde MS-URL blokkeert
                          // de preview video en verhindert autoplay.
                          if (!poster && thumbUrl !== selectedUrl) this._enqueuePoster(thumbUrl);
                        }
                      } else {
                        poster = this._posterCache.get(it.src) || "";
                      }
                    } else {
                      poster = thumbUrl;
                    }

                    const needsResolve = isMs;
                    const hasUrl = !needsResolve || !!thumbUrl || !!tThumb;
                    const showImg = this._revealedThumbs.has(it.src) && hasUrl && !!poster;

                    const tMs = this._dtMsFromSrc(it.src);
                    const tTime = this._formatTimeFromMs(tMs);

                    const obj = this._objectForSrc(it.src);
                    const objIcon = this._objectIcon(obj);
                    const objColor = this._objectColor(obj);

                    const barPos = this.config?.thumb_bar_position || "bottom";
                    const showBar = barPos !== "hidden" && (!!tTime || !!objIcon);
                    const thumbStyle = isVerticalThumbs
                      ? `aspect-ratio:${thumbRatio};border-radius:var(--cgc-thumb-radius, ${THUMB_RADIUS}px);`
                      : `width:${this.config.thumb_size}px;aspect-ratio:${thumbRatio};border-radius:var(--cgc-thumb-radius, ${THUMB_RADIUS}px);`;

                    return html`
                      <button
                        class="tthumb ${isOn ? "on" : ""} ${this._selectMode && isSel ? "sel" : ""}"
                        data-i="${it.i}"
                        data-lazy-src="${it.src}"
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
                            if (it.i === this._selectedIndex) {
                              this._previewOpen = !this._previewOpen;
                            } else {
                              this._previewOpen = true;
                            }
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

                        ${isVid
                          ? html`
                              <div
                                class="video-overlay ${barPos === "bottom"
                                  ? "has-bottom-bar"
                                  : barPos === "top"
                                    ? "has-top-bar"
                                    : ""}"
                              >
                                <ha-icon icon="mdi:play"></ha-icon>
                              </div>
                            `
                          : html``}

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
            ? html`${previewBlock}${showGalleryControls ? html`<div class="divider"></div>` : html``}`
            : html``}

          ${showGalleryControls ? html`
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
          ` : html``}

          ${previewAtBottom && showPreviewSection
            ? html`${showGalleryControls ? html`<div class="divider"></div>` : html``}${previewBlock}`
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

        ${this._imgFsOpen && selectedUrl ? html`
          <div class="img-fs-overlay" @click=${() => this._closeImageFullscreen()}>
            <img src=${selectedUrl} alt="" @click=${(e) => e.stopPropagation()} />
            <button class="img-fs-close" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._closeImageFullscreen(); }}>
              <ha-icon icon="mdi:fullscreen-exit"></ha-icon>
            </button>
          </div>
        ` : html``}

      </div>
    `;
  }

  static get styles() {
    return css`
      /*
      * ──────────────────────────────────────────────────────────────
      * Theme tokens
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
        --cgc-pill-bg:      var(--secondary-background-color, rgba(0,0,0,0.45));

        /* ── nav overlay buttons ── */
        --cgc-nav-bg:       rgba(0,0,0,0.18);
        --cgc-nav-border:   rgba(0,0,0,0.18);

        /* ── selection overlay ── */
        --cgc-sel-ov-a:     rgba(0,0,0,0.10);
        --cgc-sel-ov-b:     rgba(0,0,0,0.22);

        /* ── bulk bar ── */
        --cgc-bulk-bg:      var(--secondary-background-color, rgba(0,0,0,0.06));
        --cgc-bulk-border:  var(--divider-color,              rgba(0,0,0,0.10));

        --cgc-ts-r: 0;
        --cgc-ts-g: 0;
        --cgc-ts-b: 0;
        --cgc-tsbar-txt: #fff;
        --cgc-pill-bg: #000;
      }

      @media (prefers-color-scheme: dark) {
        :host {
          --cgc-nav-bg:     rgba(0,0,0,0.45);
          --cgc-nav-border: rgba(255,255,255,0.18);
          --cgc-sel-ov-a:   rgba(0,0,0,0.18);
          --cgc-sel-ov-b:   rgba(0,0,0,0.32);
        }
      }

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

      :host([data-live-fs]) {
        position: fixed !important;
        inset: 0 !important;
        z-index: 9999 !important;
        width: 100vw !important;
        height: 100vh !important;
      }

      :host([data-live-fs]) .root {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #000;
      }

      :host([data-live-fs]) .panel {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        border-radius: 0 !important;
      }

      :host([data-live-fs]) .preview {
        flex: 1 !important;
        height: auto !important;
        min-height: 0;
        border-radius: 0 !important;
        overflow: hidden;
      }

      :host([data-live-fs]) .divider,
      :host([data-live-fs]) .objfilters,
      :host([data-live-fs]) .tthumbs,
      :host([data-live-fs]) .datepill,
      :host([data-live-fs]) .seg {
        display: none !important;
      }

      .panel {
        background: var(--cgc-card-bg, var(--card-background-color, #fff));
        border: 1px solid
          var(--cgc-card-border-color, var(--divider-color, rgba(0,0,0,0.12)));
        border-radius: var(--r);
        box-sizing: border-box;
        padding: var(--cardPad, 10px 12px);
      }
      .divider {
        height: 1px;
        background: transparent;
        margin: 6px 0;
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
      .img-fs-overlay img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      .img-fs-close {
        position: absolute;
        top: 12px;
        right: 12px;
        background: rgba(0,0,0,0.5);
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

      .live-card-host {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        background: transparent;
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
        object-fit: var(--cgc-object-fit, cover) !important;
      }

      .segbtn.livebtn {
        width: 60px;
      }

      .segbtn.livebtn.on {
        background: var(--cgc-live-active-bg, var(--error-color, #c62828));
        color: var(--text-primary-color, #fff);
      }

      .preview-video-host {
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

      .live-picker {
        position: relative;
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

      .live-picker::before {
        content: '';
        position: absolute;
        inset: 0;
        background: var(--cgc-pill-bg, #000);
        opacity: calc(var(--barOpacity, 30) / 100);
        backdrop-filter: blur(4px);
        z-index: 0;
        pointer-events: none;
        border-radius: inherit;
      }

      .live-picker-head,
      .live-picker-list {
        position: relative;
        z-index: 1;
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

      .live-picker-item-name {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .live-picker-item-name span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .live-picker-item-name span:first-child {
        font-size: 15px;
        font-weight: 800;
      }

      .live-picker-item-entity {
        font-size: 11px;
        font-weight: 500;
        opacity: 0.55;
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
        border-radius: var(--cgc-obj-btn-radius, 10px);
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

      .video-overlay {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        pointer-events: none;
        z-index: 2;
      }

      .video-overlay ha-icon {
        --mdc-icon-size: 24px;
        --ha-icon-size: 24px;
        width: 30px;
        height: 30px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        color: white;
        background: rgba(0, 0, 0, 0.30);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
      }

      .video-overlay.has-bottom-bar {
        transform: translateY(-13px);
      }

      .video-overlay.has-top-bar {
        transform: translateY(13px);
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
        background: rgba(
          var(--cgc-ts-r, 0),
          var(--cgc-ts-g, 0),
          var(--cgc-ts-b, 0),
          calc(var(--barOpacity, 45) / 100)
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

      .live-controls-bar {
        position: absolute;
        top: 8px;
        left: 8px;
        right: 8px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
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
      .live-pills-left, .live-pills-right {
        display: flex;
        flex-direction: row;
        gap: 6px;
        align-items: center;
      }
      .live-hamburger-wrap {
        position: relative;
      }
      .live-hamburger-menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        z-index: 20;
      }
      .gallery-pills {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: row;
        gap: 6px;
        opacity: 0;
        transition: opacity 0.25s ease;
        pointer-events: none;
        z-index: 10;
      }
      .gallery-pills.visible {
        opacity: 1;
        pointer-events: auto;
      }
      .gallery-pills:not(.visible) .live-pill-btn {
        pointer-events: none;
      }
      .gallery-pills.top {
        top: 8px;
      }
      .gallery-pills.bottom {
        bottom: 8px;
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
      }
      .gallery-pill::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: var(--cgc-pill-bg, #000);
        opacity: calc(var(--barOpacity, 30) / 100);
        backdrop-filter: blur(4px);
        pointer-events: none;
      }
      .gallery-pill ha-icon,
      .gallery-pill span {
        position: relative;
        z-index: 1;
      }
      .gallery-pill span {
        display: flex;
        align-items: center;
        font-size: calc(var(--cgc-pill-size, 14px) - 2px);
        height: calc(var(--cgc-pill-size, 14px) + 2px);
        line-height: 1;
      }
      .gallery-pill ha-icon {
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
      .live-pill-btn {
        pointer-events: auto;
        border: none;
        background: transparent;
        cursor: pointer;
        padding: calc(var(--cgc-pill-size, 14px) * 0.3);
        margin: 0;
      }

      .live-pill-btn.active {
        background: rgba(255,80,80,0.85);
        border-radius: 50%;
      }

      .tsleft {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        min-width: 0;
        max-width: 60%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        pointer-events: none;
      }

      .tspill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0 12px;
        height: 22px;
        box-sizing: border-box;
        border-radius: 999px;
        background: var(--cgc-pill-bg);
        backdrop-filter: blur(6px);
        color: var(--cgc-txt);
        font-size: 11px;
        font-weight: 800;
        line-height: 1;
        white-space: nowrap;
        pointer-events: auto;
        flex-shrink: 0;
      }

      .tspill-left {
        position: absolute;
        left: 12px;
      }

      .tspill-left ha-icon {
        --ha-icon-size: 16px;
        --mdc-icon-size: 16px;
        width: 16px;
        height: 16px;
        display: block;
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
      }

      .segbtn.on {
        background: var(--primary-color, #2196f3);
        color: var(--text-primary-color, #fff);
        border-radius: var(--cgc-ctrl-radius, 10px);
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
        scrollbar-width: none;
      }

      .tthumbs.horizontal::-webkit-scrollbar { display: none; }

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
        scrollbar-width: none;
      }

      .tthumbs.vertical::-webkit-scrollbar { display: none; }

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
      }

      .tthumb.sel::after {
        border: 2px solid var(--primary-color, #2196f3);
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
      }

      .tbar.bottom {
        bottom: 0;
        border-radius: 0 0 var(--cgc-thumb-radius, 10px) var(--cgc-thumb-radius, 10px);
      }

      .tbar.top {
        top: 0;
        border-radius: var(--cgc-thumb-radius, 10px) var(--cgc-thumb-radius, 10px) 0 0;
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
        background: color-mix(in srgb, var(--error-color, #c62828) 18%, transparent);
        border: 1px solid color-mix(in srgb, var(--error-color, #c62828) 35%, transparent);
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

      .tsbar-live-center {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .tsbar-cam-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        color: var(--cgc-tsbar-txt, #fff);
        cursor: pointer;
        pointer-events: auto;
        padding: 0;
        height: 28px;
        width: 28px;
      }

      .tsbar-cam-btn ha-icon {
        --ha-icon-size: 22px;
        --mdc-icon-size: 22px;
        width: 22px;
        height: 22px;
        display: block;
      }

      .tsbar-back-btn {
        cursor: pointer;
        border: none;
      }

      .tsbar-back-btn ha-icon {
        --ha-icon-size: 16px;
        --mdc-icon-size: 16px;
        width: 16px;
        height: 16px;
        display: block;
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
  preview: true,
});

console.info(`Camera Gallery Card v${CARD_VERSION}`);
// ─── Editor (bundled) ────────────────────────────────────────────
const STYLE_SECTIONS = [
  {
    id: "card",
    label: "Card",
    icon: "mdi:card-outline",
    controls: [
      { type: "color",  hostId: "bgcolor-host",     variable: "--cgc-card-bg",           label: "Background" },
      { type: "color",  hostId: "bordercolor-host", variable: "--cgc-card-border-color", label: "Border color" },
      { type: "radius", variable: "--r",             label: "Border radius", min: 0, max: 32, default: 10 },
    ],
  },
  {
    id: "preview",
    label: "Pills",
    icon: "mdi:image-outline",
    controls: [
      { type: "color", hostId: "tsbar-txt-host", variable: "--cgc-tsbar-txt", label: "Text / icon color" },
      { type: "color", hostId: "pill-bg-host",   variable: "--cgc-pill-bg",   label: "Background color" },
      { type: "radius", variable: "--cgc-pill-size", label: "Size", min: 10, max: 28, default: 14 },
    ],
  },
  {
    id: "thumbs",
    label: "Thumbnails",
    icon: "mdi:view-grid-outline",
    controls: [
      { type: "color",  hostId: "tbarbg-host",   variable: "--cgc-tbar-bg",      label: "Bar background" },
      { type: "color",  hostId: "tbar-txt-host", variable: "--cgc-tbar-txt",     label: "Bar text color" },
      { type: "radius", variable: "--cgc-thumb-radius",   label: "Border radius", min: 0, max: 20, default: 10 },
    ],
  },
  {
    id: "filters",
    label: "Filter buttons",
    icon: "mdi:filter-outline",
    controls: [
      { type: "color",  hostId: "filterbg-host",   variable: "--cgc-obj-btn-bg",            label: "Background" },
      { type: "color",  hostId: "iconcolor-host",  variable: "--cgc-obj-icon-color",        label: "Icon color" },
      { type: "color",  hostId: "btnactive-host",  variable: "--cgc-obj-btn-active-bg",     label: "Active background" },
      { type: "color",  hostId: "iconactive-host", variable: "--cgc-obj-icon-active-color", label: "Active icon color" },
      { type: "radius", variable: "--cgc-obj-btn-radius", label: "Border radius", min: 0, max: 14, default: 10 },
    ],
  },
  {
    id: "controls",
    label: "Today / Date / Live",
    icon: "mdi:calendar-outline",
    controls: [
      { type: "color",  hostId: "ctrl-txt-host",     variable: "--cgc-ctrl-txt",       label: "Text color" },
      { type: "color",  hostId: "ctrl-chevron-host", variable: "--cgc-ctrl-chevron",   label: "Chevron color" },
      { type: "color",  hostId: "live-active-host",  variable: "--cgc-live-active-bg", label: "Live active color" },
      { type: "radius", variable: "--cgc-ctrl-radius", label: "Border radius", min: 0, max: 16, default: 10 },
    ],
  },
];

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
        detail: { config: { ...this._config } },
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
          key = Object.keys(item)[0].toLowerCase().trim();
        }

        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(item); // We bewaren het originele item (string of object)
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
      visitor: "mdi:doorbell-video",
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

  _bindColorControls() {
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
      });
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
      });
    });

    this.shadowRoot.querySelectorAll("[data-radius]").forEach((slider) => {
      const variable = slider.dataset.radius;
      const safeId = variable.replace(/[^a-z0-9]/gi, "-");
      const display = this.shadowRoot.getElementById("radius-val-" + safeId);

      slider.addEventListener("input", (e) => {
        if (display) display.textContent = e.target.value + "px";
      });

      slider.addEventListener("change", (e) => {
        this._setStyleVariable(variable, e.target.value + "px");
        this._fire();
        this._scheduleRender();
      });
    });

    this.shadowRoot.querySelectorAll("details.style-section").forEach((det) => {
      det.addEventListener("toggle", () => {
        const id = det.id.replace("style-section-", "");
        if (det.open) {
          this._openStyleSections.add(id);
        } else {
          this._openStyleSections.delete(id);
        }
      });
    });
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

    const filenameDatetimeFormat = String(
      c.filename_datetime_format || ""
    ).trim();

    const folderDatetimeFormat = String(
      c.folder_datetime_format || ""
    ).trim();

    const objectFiltersArr = this._normalizeObjectFilters(
      c.object_filters || []
    );
    const selectedCount = objectFiltersArr.length;
    const objectColors = (typeof c.object_colors === "object" && c.object_colors !== null) ? c.object_colors : {};

    const thumbSize = Number(c.thumb_size) || 140;
    const maxMedia = (() => {
      const n = this._numInt(c.max_media, 20);
      return this._clampInt(n, 1, 100);
    })();

    const tsPos = String(c.bar_position || "top");
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

    const thumbSizeMuted = thumbLayout === "vertical";

    const allServices = this._hass?.services || {};
    const shellCmds = Object.keys(allServices.shell_command || {})
      .map((svc) => `shell_command.${svc}`)
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

    const barOpacity = (() => {
      const n = Number(c.bar_opacity);
      if (!Number.isFinite(n)) return 45;
      return Math.min(100, Math.max(0, n));
    })();

    const autoplay = c.autoplay === true;
    const autoMuted =
      c.auto_muted !== undefined ? c.auto_muted === true : DEFAULT_AUTOMUTED;
    const liveAutoMuted =
      c.live_auto_muted !== undefined ? c.live_auto_muted === true : DEFAULT_LIVE_AUTO_MUTED;

    const barDisabled = tsPos === "hidden";
    const pillSize = Math.max(10, Math.min(28, Number(c.pill_size) || 14));
    const clickToOpen = c.preview_click_to_open === true;
    const persistentControls = c.persistent_controls === true;

    const liveEnabled = c.live_enabled === true;
    const liveCameraEntity = String(c.live_camera_entity || "").trim();
    const liveCameraEntities = Array.isArray(c.live_camera_entities) ? c.live_camera_entities : [];
    const liveControlsDisabled = false;

    const cameraEntities = Object.keys(this._hass?.states || {})
      .filter((id) => {
        if (!id.startsWith("camera.")) return false;

        const st = this._hass?.states?.[id];
        if (!st) return false;

        const state = String(st.state || "").toLowerCase();

        return state !== "unavailable" && state !== "unknown";
      })
      .sort((a, b) => {
        const an = String(
          this._hass?.states?.[a]?.attributes?.friendly_name || a
        ).toLowerCase();
        const bn = String(
          this._hass?.states?.[b]?.attributes?.friendly_name || b
        ).toLowerCase();
        return an.localeCompare(bn);
      });

    const rootVars = `
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

    const mediaBrowserHtml = this._mediaBrowserOpen
      ? `
        <div class="browser-backdrop" id="browser-backdrop"></div>
        <div class="browser-modal" role="dialog" aria-modal="true" aria-label="Browse media folders">
          <div class="browser-head">
            <div class="browser-head-copy">
              <div class="browser-title">Browse folders</div>
              <div class="browser-path">${this._mediaBrowserPath || "—"}</div>
            </div>
            <button type="button" class="browser-iconbtn" id="browser-close" title="Close">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>

          <div class="browser-toolbar">
            <button
              type="button"
              class="browser-btn ${this._mediaBrowserHistory.length ? "" : "disabled"}"
              id="browser-back"
              ${this._mediaBrowserHistory.length ? "" : "disabled"}
            >
              <ha-icon icon="mdi:arrow-left"></ha-icon>
              <span>Back</span>
            </button>

            <button
              type="button"
              class="browser-btn primary"
              id="browser-select-current"
              ${this._mediaBrowserPath ? "" : "disabled"}
            >
              <ha-icon icon="mdi:check"></ha-icon>
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
                                  <ha-icon icon="mdi:folder-outline"></ha-icon>
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

    const buildPanelHtml = () => {
      if (this._activeTab === "general") return `
            <div class="tabpanel" data-panel="general">
              <div class="row">
                <div class="lbl">Default view</div>
                <div class="segwrap">
                  <button class="seg ${startMode !== "live" ? "on" : ""}" data-startmode="gallery">Gallery</button>
                  <button class="seg ${startMode === "live" ? "on" : ""}" data-startmode="live">Live</button>
                </div>
              </div>

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

                ${sensorModeOn ? this._renderFilesWizard() : ""}
              </div>

              <div class="row ${mediaModeOn ? "" : "muted"}">
                <div class="lbl">Media folders</div>
                <div class="desc">Enter <strong>one</strong> folder per line, or browse and select folders</div>

                <div class="field" id="mediasources-field">
                  <textarea
                    id="mediasources"
                    rows="4"
                    placeholder="media-source://frigate/frigate/event-search/clips"
                    ${mediaModeOn ? "" : "disabled"}
                  ></textarea>
                  <div class="suggestions" id="mediasources-suggestions" hidden></div>
                </div>

                <div class="row-actions">
                  <button
                    type="button"
                    class="actionbtn"
                    id="browse-media-folders"
                    ${mediaModeOn ? "" : "disabled"}
                  >
                    <ha-icon icon="mdi:folder-search-outline"></ha-icon>
                    <span>Browse</span>
                  </button>

                  <button
                    type="button"
                    class="actionbtn"
                    id="clear-media-folders"
                    ${mediaModeOn ? "" : "disabled"}
                  >
                    <ha-icon icon="mdi:delete-outline"></ha-icon>
                    <span>Clear</span>
                  </button>
                </div>

                ${
                  mediaHasFile
                    ? `<div class="desc">⚠️ One of your entries looks like a file (extension). This field expects folders.</div>`
                    : ``
                }
              </div>

              <div class="row">
                <div class="lbl">Folder datetime format</div>
                <div class="desc">
                  Parse date from the <strong>parent folder name</strong>. Combine with Filename datetime format for folder=date, file=time setups.
                </div>

                <input type="text" class="ed-input" id="folderfmt" placeholder="DDMM" />

                <div class="hint">
                  <ha-icon icon="mdi:information-outline"></ha-icon>
                  Examples:
                  <code>DDMM</code>,
                  <code>YYYYMMDD</code>,
                  <code>DD-MM-YYYY</code>.
                  Year defaults to current year if omitted.
                </div>
              </div>

              <div class="row">
                <div class="lbl">Filename datetime format</div>
                <div class="desc">
                  Optional custom parser for date and time found in filenames.
                </div>

                <input type="text" class="ed-input" id="filenamefmt" placeholder="YYYYMMDDHHmmss" />

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
          `;

      if (this._activeTab === "viewer") return `
            <div class="tabpanel" data-panel="viewer">
              <div class="row">
                <div class="lbl">Image fit</div>
                <div class="segwrap">
                  <button class="seg ${objectFit === "cover" ? "on" : ""}" data-objfit="cover">Cover</button>
                  <button class="seg ${objectFit === "contain" ? "on" : ""}" data-objfit="contain">Contain</button>
                </div>
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
                <div class="row-head">
                  <div>
                    <div class="lbl">Persistent controls</div>
                    <div class="desc">
                      Always show controls.
                    </div>
                  </div>

                  <div class="togrow">
                    <ha-switch id="persistentcontrols" ${persistentControls ? "checked" : ""}></ha-switch>
                  </div>
                </div>
              </div>

              <div class="row">
                <div class="subrows">
                  <div class="row-head">
                    <div class="lbl">Autoplay</div>
                    <div class="togrow">
                      <ha-switch id="autoplay"></ha-switch>
                    </div>
                  </div>

                  <div class="row-head">
                    <div class="lbl">Auto muted</div>
                    <div class="togrow">
                      <ha-switch id="auto_muted"></ha-switch>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          `;

      if (this._activeTab === "live") return `
            <div class="tabpanel" data-panel="live">
              <div class="row ${liveControlsDisabled ? "muted" : ""}">
                <div class="row-head">
                  <div class="lbl">Live preview</div>

                  <div class="togrow">
                    <ha-switch
                      id="liveenabled"
                      ${liveEnabled ? "checked" : ""}
                      ${liveControlsDisabled ? "disabled" : ""}
                    ></ha-switch>
                  </div>
                </div>

                <div class="desc">
                  Enable live mode in the gallery preview. All available camera entities are detected automatically.
                </div>
              </div>

              ${
                liveEnabled
                  ? `
                ${cameraEntities.length > 1 ? `
                <div class="row">
                  <div class="lbl">Visible cameras in picker</div>
                  <div class="desc">Select cameras for the picker. Leave empty to show all cameras.</div>
                  ${liveCameraEntities.length > 0 ? `
                  <div class="livecam-tags" id="livecam-tags-dnd">
                    ${liveCameraEntities.map((id, i) => {
                      const name = String(this._hass?.states?.[id]?.attributes?.friendly_name || id).trim();
                      return `<div class="livecam-tag" draggable="true" data-dragcam="${id}"><span class="livecam-tag-grip">⠿</span><span class="livecam-tag-num">${i + 1}</span><span>${name}</span><span class="livecam-tag-entity">${id}</span><button type="button" class="livecam-tag-del" data-delcam="${id}">×</button></div>`;
                    }).join("")}
                  </div>
                  ` : ``}
                  <div class="field" style="margin-top:6px;">
                    <input type="text" class="ed-input" id="livecam-input" placeholder="Search cameras..." autocomplete="off" />
                    <div class="suggestions" id="livecam-suggestions" hidden></div>
                  </div>
                </div>
                ` : ``}

                <div class="row ${liveControlsDisabled ? "muted" : ""}">
                  <div class="lbl">Default live camera</div>
                  <div class="desc">Optional. This sets the default camera when live mode opens.</div>
                  ${liveCameraEntity ? `
                  <div class="livecam-tags">
                    <div class="livecam-tag"><span>${String(this._hass?.states?.[liveCameraEntity]?.attributes?.friendly_name || liveCameraEntity).trim()}</span><span class="livecam-tag-entity">${liveCameraEntity}</span><button type="button" class="livecam-tag-del" data-deldefcam="${liveCameraEntity}">×</button></div>
                  </div>
                  ${liveCameraEntities.length > 0 && !liveCameraEntities.includes(liveCameraEntity) ? `
                  <div class="cgc-inline-warn"><ha-icon icon="mdi:alert-outline"></ha-icon><span>This camera is not in the visible cameras list. It will not appear in the picker.</span></div>
                  ` : ``}
                  ` : ``}
                  ${!liveControlsDisabled ? `
                  <div class="field" style="margin-top:6px;">
                    <input type="text" class="ed-input" id="livedefault-input" placeholder="Search cameras..." autocomplete="off" ${liveCameraEntity ? `style="display:none;"` : ``} />
                    <div class="suggestions" id="livedefault-suggestions" hidden></div>
                  </div>
                  ` : ``}
                </div>
              `
                  : ``
              }

              <div class="row">
                <div class="row-head">
                  <div class="lbl">Auto muted</div>
                  <div class="togrow">
                    <ha-switch id="live_auto_muted"></ha-switch>
                  </div>
                </div>
              </div>

            </div>
          `;

      if (this._activeTab === "thumbs") return `
            <div class="tabpanel" data-panel="thumbs">
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
                <div class="ed-input-row"><input type="number" class="ed-input" id="thumb" /><span class="ed-suffix">px</span></div>
              </div>

              <div class="row">
                <div class="lbl">Maximum thumbnails shown</div>
                <div class="desc">Maximum number of media items loaded into the gallery</div>
                <div class="ed-input-row"><input type="number" class="ed-input" id="maxmedia" /><span class="ed-suffix">items</span></div>
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
                <div class="lbl">Pill position</div>
                <div class="segwrap">
                  <button class="seg ${tsPos === "top" ? "on" : ""}" data-pos="top">Top</button>
                  <button class="seg ${tsPos === "bottom" ? "on" : ""}" data-pos="bottom">Bottom</button>
                  <button class="seg ${tsPos === "hidden" ? "on" : ""}" data-pos="hidden">Hidden</button>
                </div>
              </div>

              <div class="row ${barDisabled ? "muted" : ""}">
                <div class="lbl">Opacity pill</div>
                <div class="barrow">
                  <div class="barrow-top">
                    <div class="pillval" id="barval">${barOpacity}%</div>
                  </div>
                  <ha-slider id="barop" min="0" max="100" step="1" ${barDisabled ? "disabled" : ""}></ha-slider>
                </div>
              </div>

              <div class="row ${barDisabled ? "muted" : ""}">
                <div class="lbl">Pill size</div>
                <div class="barrow">
                  <div class="barrow-top">
                    <div class="pillval" id="pillsizeval">${pillSize}px</div>
                  </div>
                  <ha-slider id="pillsize" min="10" max="28" step="1" ${barDisabled ? "disabled" : ""}></ha-slider>
                </div>
              </div>

              <div class="row">
                <div class="lbl">Object filters</div>
                <div class="objmeta">
                  <div class="desc">Choose which filter chips are available on the card</div>
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
                        <span class="objchip-icon">
                          <ha-icon icon="${this._objectIcon(obj)}" style="${currentColor ? "color:" + currentColor : ""}"></ha-icon>
                        </span>
                        <span class="objchip-color">
                          <input type="color" class="cgc-color" value="${colorVal}" style="${!currentColor ? "opacity:0.35" : ""}" data-filtercolor="${obj}">
                        </span>
                        <ha-checkbox ${isOn ? "checked" : ""} tabindex="-1" style="pointer-events:none;"></ha-checkbox>
                      </button>
                    `;
                    })
                    .join("")}
                </div>

              <div class="row">
                <div class="lbl">Custom Object Filters</div>
                  <div class="desc">Add custom object filters and icons (e.g., parcel, woman, etc.)</div>

                  <div class="custom-filter-add">
                    <input type="text" class="ed-input" id="new-filter-name" placeholder="e.g. parcel" />
                    <ha-icon-picker id="new-filter-icon" label="Icon"></ha-icon-picker>
                    <button class="actionbtn" id="add-filter-btn">
                      <ha-icon icon="mdi:plus"></ha-icon>
                      Add filter
                    </button>
                  </div>

                <div class="custom-filter-list">
                  ${objectFiltersArr.filter(f => typeof f === 'object').map((f, index) => {
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
                            <ha-icon icon="mdi:delete-outline"></ha-icon>
                          </button>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

              </div>
            </div>
          `;

      if (this._activeTab === "styling") return `
              <div class="tabpanel" data-panel="styling">
                <div class="style-sections">
                  ${STYLE_SECTIONS.map((section) => `
                    <details
                      class="style-section"
                      id="style-section-${section.id}"
                      ${this._openStyleSections.has(section.id) ? "open" : ""}
                    >
                      <summary class="style-section-head">
                        <ha-icon icon="${section.icon}"></ha-icon>
                        <span>${section.label}</span>
                        <ha-icon class="style-chevron" icon="mdi:chevron-down"></ha-icon>
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
                                      <ha-icon icon="mdi:backup-restore"></ha-icon>
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
                                      min="${ctrl.min}"
                                      max="${ctrl.max}"
                                      value="${val}"
                                    >
                                    <span class="radius-value" id="radius-val-${safeId}">${val}px</span>
                                    <button type="button" class="color-reset" data-reset="${ctrl.variable}" title="Reset to default">
                                      <ha-icon icon="mdi:backup-restore"></ha-icon>
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

      return "";
    };

    if (!this._editorRendered) {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 8px 0;
          color: var(--ed-text);
          box-sizing: border-box;
          min-width: 0;
        }

        .wrap {
          display: grid;
          gap: var(--ed-space-3);
          min-width: 0;
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

        .tabbtn ha-icon {
          --mdc-icon-size: 16px;
          width: 16px;
          height: 16px;
          flex: 0 0 auto;
        }

        .tabbtn.on {
          background: var(--ed-tab-on-bg);
          border-color: var(--ed-tab-on-border);
          color: var(--ed-tab-on-txt);
          box-shadow: var(--ed-shadow-press);
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
          min-height: 420px;
          box-sizing: border-box;
          scrollbar-gutter: stable;
        }

        .panelhead {
          display: flex;
          align-items: center;
          gap: 4px;
          padding-bottom: 6px;
          min-width: 0;
        }

        .panelicon {
          width: 40px;
          height: 40px;
          min-width: 40px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: var(--ed-input-bg);
          border: 1px solid var(--ed-input-border);
          box-shadow: var(--ed-section-glow);
        }

        .panelicon ha-icon {
          --mdc-icon-size: 20px;
          width: 20px;
          height: 20px;
          color: var(--ed-text);
        }

        .panelhead-copy {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .paneltitle {
          font-size: 16px;
          font-weight: 1000;
          color: var(--ed-text);
          line-height: 1.2;
        }

        .panelsubtitle {
          font-size: 12px;
          color: var(--ed-text2);
          line-height: 1.45;
        }

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

        ha-slider {
          width: 100%;
        }

        .field {
          position: relative;
          min-width: 0;
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
          box-shadow: 0 0 0 3px var(--ed-valid-glow);
        }

        .field.invalid textarea {
          border-color: var(--ed-invalid);
          box-shadow: 0 0 0 3px var(--ed-invalid-glow);
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

        .color-reset ha-icon {
          --mdc-icon-size: 16px;
        }

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
          box-shadow: 0 0 0 3px var(--ed-invalid-glow);
        }

        .segwrap {
          display: flex;
          gap: 8px;
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

        .hint ha-icon {
          --mdc-icon-size: 14px;
          color: var(--ed-text2);
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

        .actionbtn ha-icon {
          --mdc-icon-size: 18px;
          width: 18px;
          height: 18px;
        }

        .livecam-tags {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 6px;
        }
        .livecam-tag {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 6px 4px 6px;
          background: var(--ed-chip-bg);
          border: 1px solid var(--ed-chip-border);
          border-radius: 999px;
          font-size: 12px;
          color: var(--ed-text);
          cursor: grab;
          transition: opacity 0.15s, box-shadow 0.15s;
        }
        .livecam-tag.dnd-dragging { opacity: 0.35; }
        .livecam-tag.dnd-over { box-shadow: -3px 0 0 0 var(--primary-color, #03a9f4); }
        .livecam-tag-grip {
          font-size: 18px; opacity: 0.4; line-height: 1;
          cursor: grab; user-select: none;
          padding: 4px 6px 4px 2px; margin: -4px 0;
          touch-action: none;
        }
        .livecam-tag-num {
          font-size: 10px; font-weight: 700; opacity: 0.5;
          background: var(--ed-text2, #888); color: var(--ed-bg, #fff);
          border-radius: 999px; min-width: 16px; height: 16px;
          display: flex; align-items: center; justify-content: center;
          padding: 0 4px; line-height: 1;
        }
        .livecam-tag-entity {
          opacity: 0.45;
          font-size: 10px;
          font-weight: 500;
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

        .objchip-icon ha-icon {
          --mdc-icon-size: 18px;
          color: inherit;
          width: 18px;
          height: 18px;
          display: block;
        }

        .objchip-label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: inherit;
        }

        .objchip-check {
          display: none;
        }

        .objchip ha-checkbox {
          --mdc-checkbox-unchecked-color: var(--ed-chip-border);
          pointer-events: none;
          justify-self: end;
        }

        /* Nieuwe styles voor custom filters */
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

        .custom-filter-add ha-icon-picker {
          width: 100%;
          display: block;
          --mdc-text-field-fill-color: var(--ed-input-bg);
          --mdc-text-field-ink-color: var(--ed-text);
          --mdc-text-field-label-ink-color: var(--ed-text2);
          --mdc-text-field-idle-line-color: var(--ed-input-border);
          --mdc-text-field-hover-line-color: var(--ed-input-border);
          --mdc-theme-primary: var(--primary-color);
        }

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

        .custom-item-info ha-icon {
          --mdc-icon-size: 20px;
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

        .remove-btn ha-icon {
          --mdc-icon-size: 18px;
        }


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

        .objchip-color .color-reset ha-icon {
          --mdc-icon-size: 13px;
        }

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

        .browser-iconbtn ha-icon {
          --mdc-icon-size: 18px;
          width: 18px;
          height: 18px;
        }

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

        .browser-btn ha-icon {
          --mdc-icon-size: 18px;
          width: 18px;
          height: 18px;
        }

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

        .browser-open-icon ha-icon {
          --mdc-icon-size: 20px;
          width: 20px;
          height: 20px;
        }

        .browser-open-copy {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .hint-block {
          display: grid;
          gap: 8px;
          align-items: start;
        }

        .hint-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--ed-text2);
        }

        .vars-list {
          display: grid;
          gap: 6px;
          padding-left: 22px;
        }

        .vars-list div {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          line-height: 1.45;
        }

        .vars-list code {
          opacity: 1;
        }

        .vars-list span {
          color: var(--ed-text2);
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

        .style-section-head ha-icon:first-child {
          --mdc-icon-size: 18px;
          color: var(--ed-text2);
          flex: 0 0 auto;
        }

        .style-section-head > span {
          flex: 1 1 auto;
        }

        .style-chevron {
          --mdc-icon-size: 18px;
          color: var(--ed-text2);
          flex: 0 0 auto;
          transition: transform 0.2s ease;
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

        .radius-value {
          font-size: 12px;
          font-weight: 800;
          color: var(--ed-text2);
          min-width: 34px;
          text-align: right;
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

          .panelhead {
            gap: 12px;
          }

          .panelicon {
            width: 38px;
            height: 38px;
            min-width: 38px;
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
        .cgc-wizard-hint { font-size: 11px; color: var(--secondary-text-color); }
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
        .cgc-inline-warn ha-icon { flex-shrink: 0; --mdc-icon-size: 14px; margin-top: 1px; }
      </style>

      <div class="wrap" style="${rootVars}">
        <div class="tabs">
          <div class="tabbar">
            ${tabBtn("general", "General", "mdi:cog-outline")}
            ${tabBtn("viewer", "Viewer", "mdi:image-outline")}
            ${tabBtn("live", "Live", "mdi:video-outline")}
            ${tabBtn("thumbs", "Thumbnails", "mdi:view-grid-outline")}
            ${tabBtn("styling", "Styling", "mdi:palette-outline")}
          </div>

          ${buildPanelHtml()}

        </div>
      </div>

      <div id="cgc-browser-slot">${mediaBrowserHtml}</div>
    `;
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
      if (oldPanel && tmp.firstElementChild) {
        oldPanel.replaceWith(tmp.firstElementChild);
      } else if (!oldPanel && tmp.firstElementChild) {
        this.shadowRoot.querySelector(".tabbar")?.insertAdjacentElement("afterend", tmp.firstElementChild);
      }

      // Update media browser slot
      const browserSlot = this.shadowRoot.getElementById("cgc-browser-slot");
      if (browserSlot) browserSlot.innerHTML = mediaBrowserHtml;
    }

    const $ = (id) => this.shadowRoot.getElementById(id);

        // 1. Zoek de elementen op
        const addBtn = $("add-filter-btn");
        const nameInput = $("new-filter-name");
        const iconInput = $("new-filter-icon");
        if (iconInput && this._hass) iconInput.hass = this._hass;

        // 2. Maak een herbruikbare functie voor het toevoegen
        const handleAddFilter = () => {
          const name = nameInput?.value.trim().toLowerCase();
          const icon = iconInput?.value.trim() || "mdi:magnify";

          if (!name) return;

          // Haal huidige filters op
          const currentFilters = this._normalizeObjectFilters(this._config.object_filters || []);
          const newFilter = { [name]: icon };
          
          // Sla op in de config
          this._set("object_filters", [...currentFilters, newFilter]);
          
          // Maak velden leeg
          if (nameInput) nameInput.value = "";
          if (iconInput) iconInput.value = "";
        };

        // 3. Koppel de Click listener aan de knop
        addBtn?.addEventListener("click", handleAddFilter);

        // 4. Enter op naam-veld voegt toe; ha-icon-picker gebruikt value-changed (geen keydown)
        nameInput?.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); handleAddFilter(); }
        });

    // Filter verwijderen
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
      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("change", (e) => {
        e.stopPropagation();
        const name = input.dataset.filtercolor;
        const colors = { ...(this._config.object_colors || {}), [name]: e.target.value };
        this._set("object_colors", colors);
      });
    });

    const entitiesEl = $("entities");
    const mediaEl = $("mediasources");
    const filenameFmtEl = $("filenamefmt");
    const folderFmtEl = $("folderfmt");
    const delserviceEl = $("delservice");

    const thumbEl = $("thumb");
    const maxmediaEl = $("maxmedia");
    const baropEl = $("barop");
    const barvalEl = $("barval");
    const pillsizeEl = $("pillsize");
    const pillsizevalEl = $("pillsizeval");

    const autoplayEl = $("autoplay");
    const autoMutedEl = $("auto_muted");
    const liveAutoMutedEl = $("live_auto_muted");

    this._setControlValue(entitiesEl, entitiesText);
    this._setControlValue(mediaEl, mediaSourcesText);
    this._setControlValue(filenameFmtEl, filenameDatetimeFormat);
    this._setControlValue(folderFmtEl, folderDatetimeFormat);
    this._setControlValue(thumbEl, String(thumbSize));
    this._setControlValue(maxmediaEl, String(maxMedia));
    this._setControlValue(baropEl, barOpacity);
    this._setControlValue(pillsizeEl, pillSize);
    if (autoplayEl) autoplayEl.checked = autoplay;
    if (autoMutedEl) autoMutedEl.checked = autoMuted;
    if (liveAutoMutedEl) liveAutoMutedEl.checked = liveAutoMuted;

    if (delserviceEl) delserviceEl.value = deleteService;

    this._applyFieldValidation("entities");
    this._applyFieldValidation("mediasources");

    this._bindColorControls();
    this._bindWizardEvents();

    this.shadowRoot.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => this._setActiveTab(btn.dataset.tab));
    });

    this.shadowRoot.querySelectorAll("[data-src]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._set("source_mode", btn.dataset.src)
      );
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

      this._config = this._stripAlwaysTrueKeys(next);
      this._fire();
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

    const commitFolderFormat = (commit = false) => {
      const raw = String(folderFmtEl?.value ?? "").trim();
      const next = { ...this._config };
      if (!raw) {
        delete next.folder_datetime_format;
      } else {
        next.folder_datetime_format = raw;
      }
      this._config = this._stripAlwaysTrueKeys(next);
      if (commit) { this._fire(); this._scheduleRender(); }
    };

    folderFmtEl?.addEventListener("input", () => commitFolderFormat(false));
    folderFmtEl?.addEventListener("change", () => commitFolderFormat(true));
    folderFmtEl?.addEventListener("blur", () => commitFolderFormat(true));

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

    $("clicktoopen")?.addEventListener("change", (e) => {
      this._set("preview_click_to_open", !!e.target.checked);
    });

    $("persistentcontrols")?.addEventListener("change", (e) => {
      this._set("persistent_controls", !!e.target.checked);
    });

    autoplayEl?.addEventListener("change", (e) => {
      this._set("autoplay", !!e.target.checked);
    });

    autoMutedEl?.addEventListener("change", (e) => {
      this._set("auto_muted", !!e.target.checked);
    });

    liveAutoMutedEl?.addEventListener("change", (e) => {
      this._set("live_auto_muted", !!e.target.checked);
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

    // Default live camera tag input (single select)
    const livedefaultInput = $("livedefault-input");
    const livedefaultSugg = $("livedefault-suggestions");

    if (livedefaultInput && livedefaultSugg) {
      const renderDefSuggestions = (items) => {
        if (!items.length) { livedefaultSugg.hidden = true; livedefaultSugg.innerHTML = ""; return; }
        livedefaultSugg.hidden = false;
        livedefaultSugg.innerHTML = `
          <div class="sugg-label">Cameras</div>
          ${items.map((id) => {
            const name = String(this._hass?.states?.[id]?.attributes?.friendly_name || id).trim();
            return `<button type="button" class="sugg-item" data-setdefcam="${id}">${name}<span style="opacity:0.45;font-weight:500;margin-left:6px;">${id}</span></button>`;
          }).join("")}
        `;
        livedefaultSugg.querySelectorAll("[data-setdefcam]").forEach((btn) => {
          btn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            setDefCam(btn.dataset.setdefcam);
          });
        });
      };

      const setDefCam = (id) => {
        if (!id) return;
        this._set("live_camera_entity", id);
        livedefaultInput.value = "";
        livedefaultSugg.hidden = true;
        livedefaultSugg.innerHTML = "";
        this._scheduleRender();
      };

      const getDefSuggestions = () => {
        const q = livedefaultInput.value.trim().toLowerCase();
        return cameraEntities.filter((id) => {
          if (!q) return true;
          const name = String(this._hass?.states?.[id]?.attributes?.friendly_name || id).toLowerCase();
          return name.includes(q) || id.includes(q);
        });
      };

      livedefaultInput.addEventListener("focus", () => renderDefSuggestions(getDefSuggestions()));
      livedefaultInput.addEventListener("input", () => renderDefSuggestions(getDefSuggestions()));
      livedefaultInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const first = livedefaultSugg.querySelector("[data-setdefcam]");
          if (first) setDefCam(first.dataset.setdefcam);
        } else if (e.key === "Escape") {
          livedefaultSugg.hidden = true;
        }
      });
      livedefaultInput.addEventListener("blur", () => {
        setTimeout(() => { livedefaultSugg.hidden = true; }, 150);
      });
    }

    // Camera tag input voor live picker
    const livecamInput = $("livecam-input");
    const livecamSugg = $("livecam-suggestions");

    if (livecamInput && livecamSugg) {
      const renderCamSuggestions = (items) => {
        if (!items.length) { livecamSugg.hidden = true; livecamSugg.innerHTML = ""; return; }
        livecamSugg.hidden = false;
        livecamSugg.innerHTML = `
          <div class="sugg-label">Cameras</div>
          ${items.map((id) => {
            const name = String(this._hass?.states?.[id]?.attributes?.friendly_name || id).trim();
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
        const current = Array.isArray(this._config.live_camera_entities)
          ? [...this._config.live_camera_entities] : [];
        if (!current.includes(id)) {
          current.push(id);
          this._set("live_camera_entities", current);
        }
        livecamInput.value = "";
        livecamSugg.hidden = true;
        livecamSugg.innerHTML = "";
        this._scheduleRender();
      };

      const getCamSuggestions = () => {
        const q = livecamInput.value.trim().toLowerCase();
        const selected = Array.isArray(this._config.live_camera_entities) ? this._config.live_camera_entities : [];
        return cameraEntities.filter((id) => {
          if (selected.includes(id)) return false;
          if (!q) return true;
          const name = String(this._hass?.states?.[id]?.attributes?.friendly_name || id).toLowerCase();
          return name.includes(q) || id.includes(q);
        });
      };

      livecamInput.addEventListener("focus", () => renderCamSuggestions(getCamSuggestions()));
      livecamInput.addEventListener("input", () => renderCamSuggestions(getCamSuggestions()));
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

    // Default live camera verwijderen
    this.shadowRoot.querySelectorAll("[data-deldefcam]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = { ...this._config };
        delete next.live_camera_entity;
        this._config = this._stripAlwaysTrueKeys(next);
        this._fire();
        this._scheduleRender();
      });
    });

    // Camera tag verwijderen
    this.shadowRoot.querySelectorAll("[data-delcam]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.delcam;
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

    // Drag-and-drop reorder voor live_camera_entities chips (mouse + touch)
    const dndContainer = this.shadowRoot.getElementById("livecam-tags-dnd");
    if (dndContainer) {
      let dragSrcId = null;

      const clearOver = () => dndContainer.querySelectorAll(".dnd-over").forEach((el) => el.classList.remove("dnd-over"));

      const doReorder = (targetId) => {
        if (!dragSrcId || dragSrcId === targetId) return;
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

      dndContainer.querySelectorAll("[data-dragcam]").forEach((chip) => {
        // Mouse drag
        chip.addEventListener("dragstart", (e) => {
          dragSrcId = chip.dataset.dragcam;
          chip.classList.add("dnd-dragging");
          e.dataTransfer.effectAllowed = "move";
        });
        chip.addEventListener("dragend", () => {
          chip.classList.remove("dnd-dragging");
          clearOver();
          dragSrcId = null;
        });
        chip.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (chip.dataset.dragcam !== dragSrcId) { clearOver(); chip.classList.add("dnd-over"); }
        });
        chip.addEventListener("dragleave", () => chip.classList.remove("dnd-over"));
        chip.addEventListener("drop", (e) => {
          e.preventDefault();
          clearOver();
          doReorder(chip.dataset.dragcam);
        });

        // Touch drag — alleen starten via grip
        const grip = chip.querySelector(".livecam-tag-grip");
        if (grip) {
          grip.addEventListener("touchstart", (e) => {
            e.preventDefault();
            dragSrcId = chip.dataset.dragcam;
            chip.classList.add("dnd-dragging");
          }, { passive: false });

          grip.addEventListener("touchmove", (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const el = this.shadowRoot.elementFromPoint
              ? this.shadowRoot.elementFromPoint(touch.clientX, touch.clientY)
              : document.elementFromPoint(touch.clientX, touch.clientY);
            const target = el?.closest?.("[data-dragcam]");
            clearOver();
            if (target && target.dataset.dragcam !== dragSrcId) target.classList.add("dnd-over");
          }, { passive: false });

          grip.addEventListener("touchend", (e) => {
            e.preventDefault();
            chip.classList.remove("dnd-dragging");
            const over = dndContainer.querySelector(".dnd-over");
            const targetId = over?.dataset?.dragcam;
            clearOver();
            if (targetId) doReorder(targetId);
            dragSrcId = null;
          }, { passive: false });
        }
      });
    }

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

    const updatePillSizeVal = (v) => {
      if (pillsizevalEl) pillsizevalEl.textContent = `${v}px`;
    };

    pillsizeEl?.addEventListener("input", (e) => {
      updatePillSizeVal(Number(e.target.value));
    });

    pillsizeEl?.addEventListener("change", (e) => {
      const v = Number(e.target.value);
      updatePillSizeVal(v);
      this._set("pill_size", Number.isFinite(v) ? v : 14);
    });

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
    const RENDERS_REQUIRED = new Set(["source_mode", "live_enabled", "live_camera_entities", "object_filters", "delete_service", "live_camera_entity"]);
    if (RENDERS_REQUIRED.has(key)) this._scheduleRender();
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

    if (typeof this._config.autoplay === "undefined") {
      this._config.autoplay = DEFAULT_AUTOPLAY;
    }

    if (typeof this._config.auto_muted === "undefined") {
      this._config.auto_muted = DEFAULT_AUTOMUTED;
    }

    if (typeof this._config.live_auto_muted === "undefined") {
      this._config.live_auto_muted = DEFAULT_LIVE_AUTO_MUTED;
    }

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
    const prev = this._hass;
    this._hass = hass;

    if (this._mediaBrowserOpen) return;

    const ae = this.shadowRoot?.activeElement;
    const tag = String(ae?.tagName || "").toLowerCase();
    const id = String(ae?.id || "");

    const interacting = !!(
      ae &&
      (tag === "input" ||
        tag === "textarea" ||
        tag === "ha-slider" ||
        id === "entities" ||
        id === "mediasources" ||
        id === "filenamefmt" ||
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

  _renderFilesWizard() {
    const s = this._wizardStatus;
    const loading = s === "loading";
    return `
      <div class="cgc-wizard">
        <button class="cgc-wizard-toggle" id="cgc-wizard-toggle">
          ${this._wizardOpen ? "▾" : "▸"} Create new FileTrack sensor
        </button>
        <a class="cgc-wizard-link" href="https://github.com/TheScubadiver/FileTrack" target="_blank" rel="noopener">FileTrack op GitHub</a>
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

  _bindWizardEvents() {
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