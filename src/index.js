/**
 * Camera Gallery Card
 */

import { LitElement, html, css } from "lit";

import {
  dayKeyFromMs,
  dtKeyFromMs,
  dtMsFromSrc,
  uniqueDays,
} from "./data/datetime-parsing";
import { configDiff } from "./config/diff";
import { migrateLegacyKeys, normalizeConfig } from "./config/normalize";
import {
  filterLabel,
  filterLabelList,
  getFilterAliases,
  itemFilenameForFilter,
  matchesObjectFilterForFileSensor,
  objectColor,
  objectIcon,
  sensorTextForFilter,
} from "./data/object-filters";
import { dedupeByRelPath } from "./data/pairing";
import { FavoritesStore } from "./data/favorites";
import {
  parseServiceParts,
  SensorSourceClient,
  toFsPath,
  toWebPath,
} from "./data/sensor-source";
import {
  isMediaSourceId,
  isRenderable,
  keyFromRoots as msKeyFromRoots,
  MediaSourceClient,
  walkCacheKey as msWalkCacheKey,
} from "./data/media-walker";
import { CombinedSourceClient } from "./data/combined-source";
import { canDeleteItem, deleteItem } from "./data/delete-service";
import { fnv1aHash } from "./util/hash";
import { isVideo } from "./util/media-type";
import {
  FRIGATE_URI_PREFIX,
  frigateEventIdMs,
  hasFrigateConfig,
  isFrigateRoot,
} from "./util/frigate";
import {
  formatDateTime,
  formatDay,
  formatMonth,
  formatTimeFromMs,
  resolveLocale,
} from "./util/locale";
import {
  AVAILABLE_OBJECT_FILTERS,
  DEFAULT_ALLOW_BULK_DELETE,
  DEFAULT_ALLOW_DELETE,
  DEFAULT_AUTOMUTED,
  DEFAULT_AUTOPLAY,
  DEFAULT_BAR_OPACITY,
  DEFAULT_CLEAN_MODE,
  DEFAULT_DELETE_CONFIRM,
  DEFAULT_DELETE_SERVICE,
  DEFAULT_LIVE_AUTO_MUTED,
  DEFAULT_LIVE_ENABLED,
  DEFAULT_MAX_MEDIA,
  DEFAULT_PREVIEW_CLOSE_ON_TAP_WHEN_GATED,
  DEFAULT_PREVIEW_POSITION,
  DEFAULT_SOURCE_MODE,
  DEFAULT_THUMB_BAR_POSITION,
  DEFAULT_THUMB_LAYOUT,
  DEFAULT_THUMBNAIL_FRAME_PCT,
  DEFAULT_VISIBLE_OBJECT_FILTERS,
  MAX_VISIBLE_OBJECT_FILTERS,
  PREVIEW_WIDTH,
  SENSOR_POSTER_CONCURRENCY,
  SENSOR_POSTER_QUEUE_LIMIT,
  STYLE,
  THUMB_GAP,
  THUMB_LONG_PRESS_MOVE_PX,
  THUMB_LONG_PRESS_MS,
  THUMB_RADIUS,
  THUMB_SIZE,
  THUMBS_ENABLED,
} from "./const";

// Replaced at build time by @rollup/plugin-replace from package.json `version`.
/* global __VERSION__ */
const CARD_VERSION = __VERSION__;

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
      _showDatePicker: { type: Boolean },
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
      _filterVideo: { type: Boolean },
      _filterImage: { type: Boolean },
      _filterFavorites: { type: Boolean },
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
    this._liveWarmedUp = false;
    this._signedWsPath = null;
    this._signedWsPathTs = 0;
    this._autoAspectVideo = null;
    this._autoAspectObs = null;
    this._liveQuickSwitchTimer = null;
    this._navHideT = null;
    this._objectFilters = [];
    this._filterVideo = false;
    this._filterImage = false;
    this._filterFavorites = false;
    this._pendingScrollToI = null;
    this._posterCache = new Map();
    this._posterPending = new Set();
    // URLs that returned 404 / failed to decode / timed out. Skipped by
    // _enqueuePoster, _drainPosterQueue, and _ensurePoster so a single bad
    // file doesn't spam the network and console on every render.
    this._posterFailed = new Set();
    // Unsubscribe callback for HA WS Frigate-event-push subscription.
    // null = not subscribed, function = active subscription.
    this._frigateEventsUnsub = null;
    this._objectCache = new Map();
    this._previewOpen = false;
    this._selectMode = false;
    this._selectedSet = new Set();
    this._showBulkHint = false;
    this._bulkHintTimer = null;
    this._showDatePicker = false;
    this._datePickerDays = null;
    this._showLivePicker = false;
    this._showLiveQuickSwitch = false;
    this._showNav = false;
    this._pillsVisible = false;
    this._pillsHovered = false;
    this._pillsTimer = null;
    this._pillsHideActive = false;
    this._sensorClient = new SensorSourceClient();
    this._favorites = new FavoritesStore({ onChange: () => this.requestUpdate() });
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

    // Stable bound resolver passed into pure datetime-parsing functions.
    this.__dtResolveName = (src) => this._sourceNameForParsing(src);

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
      if (!this._isLiveActive() && !this._previewOpen) return;
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
      if (!this._isLiveActive() && !this._previewOpen) return;
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

    this._onZoomMouseDown = (e) => {
      if ((!this._isLiveActive() && !this._previewOpen) || this._zoomScale <= 1) return;
      e.preventDefault();
      this._zoomIsPanning = true;
      this._zoomPanStartX = e.clientX;
      this._zoomPanStartY = e.clientY;
      this._zoomPanBaseX = this._zoomPanX;
      this._zoomPanBaseY = this._zoomPanY;
    };

    this._onZoomMouseMove = (e) => {
      if (!this._zoomIsPanning) return;
      e.preventDefault();
      this._zoomPanX = this._zoomPanBaseX + (e.clientX - this._zoomPanStartX);
      this._zoomPanY = this._zoomPanBaseY + (e.clientY - this._zoomPanStartY);
      this._clampZoomPan();
      this._applyZoom();
    };

    this._onZoomMouseUp = () => {
      this._zoomIsPanning = false;
    };

    this._onZoomWheel = (e) => {
      if (!this._isLiveActive() && !this._previewOpen) return;
      const host = this._getZoomHost();
      if (!host) return;
      const r = host.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const oldScale = this._zoomScale;
      const newScale = Math.max(1, Math.min(5, oldScale * factor));
      if (newScale !== oldScale) {
        const lcX = r.left + r.width / 2 - this._zoomPanX;
        const lcY = r.top + r.height / 2 - this._zoomPanY;
        const k = newScale / oldScale;
        this._zoomPanX = (e.clientX - lcX) * (1 - k) + this._zoomPanX * k;
        this._zoomPanY = (e.clientY - lcY) * (1 - k) + this._zoomPanY * k;
        this._zoomScale = newScale;
      }
      if (this._zoomScale <= 1) { this._zoomPanX = 0; this._zoomPanY = 0; }
      else this._clampZoomPan();
      this._applyZoom();
    };

    this._mediaClient = new MediaSourceClient({
      onChange: () => this.requestUpdate(),
      getDtOpts: () => this._dtOpts,
      resolveItemMs: (src) => this._resolveItemMs(src),
    });
    this._combinedClient = new CombinedSourceClient(this._sensorClient, this._mediaClient);
    this._previewLoadTimer = null;

    this._posterQueue = [];
    this._posterQueued = new Set();
    this._posterInFlight = new Set();

    this._revealedThumbs = new Set();
    this._thumbObserver = null;
    this._thumbObserverRoot = null;
    this._observedThumbs = new WeakSet();
  }

  _startMediaPoll() {
    this._stopMediaPoll();
    if (this.config?.source_mode !== "media" && this.config?.source_mode !== "combined") return;
    this._mediaClient.ensureLoaded();
    this._mediaPollInterval = setInterval(() => {
      this._mediaClient.invalidate();
      this._mediaClient.ensureLoaded();
    }, 30_000);
  }

  _stopMediaPoll() {
    if (this._mediaPollInterval) {
      clearInterval(this._mediaPollInterval);
      this._mediaPollInterval = null;
    }
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
    this.addEventListener('mousedown', this._onZoomMouseDown);
    window.addEventListener('mousemove', this._onZoomMouseMove);
    window.addEventListener('mouseup', this._onZoomMouseUp);
    if (navigator.maxTouchPoints > 0) this._showPills(5000);
    this._startMediaPoll();
    // Idempotent — if hass isn't set yet, returns early; the firstHass branch
    // in `set hass` then catches it. Covers disconnect→reconnect cycles where
    // _hass stays set but the previous subscription was torn down.
    this._subscribeFrigateEvents();
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
    this.removeEventListener('mousedown', this._onZoomMouseDown);
    window.removeEventListener('mousemove', this._onZoomMouseMove);
    window.removeEventListener('mouseup', this._onZoomMouseUp);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

    this._stopMediaPoll();
    this._unsubscribeFrigateEvents();
    if (this._liveQuickSwitchTimer) clearTimeout(this._liveQuickSwitchTimer);
    if (this._navHideT) clearTimeout(this._navHideT);
    if (this._bulkHintTimer) clearTimeout(this._bulkHintTimer);
    if (this._micErrorTimer) clearTimeout(this._micErrorTimer);

    this._liveQuickSwitchTimer = null;
    this._navHideT = null;
    this._bulkHintTimer = null;
    this._micErrorTimer = null;

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
    this._sensorClient.setHass(hass);
    this._mediaClient.setHass(hass);

    if (firstHass) {
      if (this.config?.start_mode === "live" && this._hasLiveConfig()) {
        this._viewMode = "live";
      }
      // Fire-and-forget: subscribe to HA's Frigate event push stream.
      this._subscribeFrigateEvents();
      this.requestUpdate();
      return;
    }

    // Forward hass to live card immediately — no re-render needed just for token refresh
    if (this._liveCard) this._liveCard.hass = hass;

    // Only re-render when an entity we actually display has changed state
    const sensorIds = this._sensorClient.getEntityIds();
    const cameraIds = Array.isArray(this.config?.live_camera_entities)
      ? this.config.live_camera_entities
      : [];

    const menuIds = (this.config?.menu_buttons ?? []).map(b => b.entity).filter(Boolean);
    const watchIds = [...sensorIds, ...cameraIds, ...menuIds];

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

  // ─── Frigate WS event push ─────────────────────────────────────────
  //
  // Subscribe to HA's `frigate/events/subscribe` WS endpoint so new Frigate
  // events arrive as push messages over the WebSocket connection HA already
  // keeps alive. On any push we invalidate the freshness gate and trigger a
  // refresh. Falls back silently when HA's Frigate integration isn't present.

  _frigateInstanceId() {
    // HA's Frigate integration uses a per-instance client_id. The second
    // segment of a `media-source://frigate/<client_id>/…` URI is that id.
    const sources = Array.isArray(this.config?.media_sources)
      ? this.config.media_sources
      : [];
    for (const ms of sources) {
      const m = String(ms || "").match(/^media-source:\/\/frigate\/([^/]+)/);
      if (m) return m[1];
    }
    return null;
  }

  async _subscribeFrigateEvents() {
    if (this._frigateEventsUnsub) return;
    const conn = this._hass?.connection;
    if (!conn) return;
    const sm = this.config?.source_mode;
    if (sm !== "media" && sm !== "combined") return;
    const instanceId = this._frigateInstanceId();
    if (!instanceId) return;
    try {
      this._frigateEventsUnsub = await conn.subscribeMessage(
        (data) => this._onFrigateEventPush(data),
        { type: "frigate/events/subscribe", instance_id: instanceId }
      );
    } catch (_) {
      // Frigate integration not installed or HA version too old — fall through
      // to existing polling behavior.
      this._frigateEventsUnsub = null;
    }
  }

  _unsubscribeFrigateEvents() {
    if (!this._frigateEventsUnsub) return;
    const fn = this._frigateEventsUnsub;
    // Null the field before invoking so a re-entry (disconnectedCallback fires
    // twice on rapid lovelace re-renders) skips the duplicate unsubscribe.
    this._frigateEventsUnsub = null;
    try {
      const result = fn();
      // home-assistant-js-websocket's UnsubscribeFunc returns a Promise.
      // After an HA WS reconnect the server has forgotten the subscription
      // ID, so the resulting promise rejects with `not_found`. That's
      // expected — swallow it so the user doesn't see "Uncaught in promise".
      if (result && typeof result.then === "function") {
        result.catch(() => {});
      }
    } catch (_) {}
  }

  _onFrigateEventPush(data) {
    // Frigate pushes 'new' / 'update' / 'end' messages per event. Only refresh
    // on 'end' — the clip is finalized then, and we avoid 3× walks per event.
    let payload;
    try {
      payload = typeof data === "string" ? JSON.parse(data) : data;
    } catch (_) {
      return;
    }
    if (payload?.type !== "end") return;

    {
      // Bypass freshness gate.
      this._mediaClient.invalidate();
      // Bypass the persistent walk cache so we do a real media-source walk
      // instead of replaying stale localStorage data.
      try {
        const roots = Array.isArray(this.config?.media_sources)
          ? this.config.media_sources
          : [];
        if (roots.length) {
          const cacheKey = msWalkCacheKey(msKeyFromRoots(roots));
          localStorage.removeItem(cacheKey);
        }
      } catch (_) {}
    }
    this._mediaClient.ensureLoaded();
  }

  // ─── Generic helpers ───────────────────────────────────────────────

  _syncPreviewPlaybackFromState() {
    if (!this._hass || !this.config) return;

    const usingMediaSource = this.config?.source_mode === "media" || this.config?.source_mode === "combined";
    const rawItems = this._items();

    if (!rawItems.length) {
      this._clearPreviewVideoHostPlayback();
      return;
    }

    const withDt = rawItems.map((it, idx) => {
      const dtMs = Number.isFinite(it.dtMs) ? it.dtMs : null;
      const dayKey = dtMs !== null ? dayKeyFromMs(dtMs) : null;
      return { dayKey, dtMs, idx, src: it.src };
    });

    withDt.sort((a, b) => {
      const aOk = Number.isFinite(a.dtMs);
      const bOk = Number.isFinite(b.dtMs);
      if (aOk && bOk && b.dtMs !== a.dtMs) return b.dtMs - a.dtMs;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return b.idx - a.idx;
    });

    const allWithDay = withDt.map((x) => ({ dayKey: x.dayKey, src: x.src, dtMs: x.dtMs }));
    const days = uniqueDays(allWithDay);
    const newestDay = days[0] ?? null;
    const activeDay = this._selectedDay ?? newestDay;

    const dayFiltered = !activeDay
      ? allWithDay
      : allWithDay.filter((x) => x.dayKey === activeDay);

    const filteredAll = dayFiltered.filter(
      (x) => this._matchesObjectFilter(x.src) && this._matchesTypeFilter(x.src)
    );

    const cap = (this.config?.max_media ?? DEFAULT_MAX_MEDIA);
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
    if (isMediaSourceId(selected)) {
      selectedUrl = this._mediaClient.getUrlCache().get(selected) || "";
    }

    let selectedMime = "";
    let selectedCls = "";
    let selectedTitle = "";

    if (usingMediaSource && isMediaSourceId(selected)) {
      const meta = this._mediaClient.getMetaById(selected);
      selectedMime = meta.mime;
      selectedCls = meta.cls;
      selectedTitle = meta.title;
    }

    const selectedIsVideo =
      !!selected &&
      this._isVideoSmart(selectedUrl || selectedTitle, selectedMime, selectedCls);

    const previewGated = !!this.config?.clean_mode;
    const previewOpen = !previewGated || !!this._previewOpen;
    const selectedNeedsResolve =
      !!selected && usingMediaSource && isMediaSourceId(selected);
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
    if (this._posterFailed.has(key)) return;

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
      const src = this._posterQueue.pop();
      this._posterQueued.delete(src);

      if (!src) continue;
      if (this._posterCache.has(src)) continue;
      if (this._posterPending.has(src)) continue;
      if (this._posterInFlight.has(src)) continue;
      if (this._posterFailed.has(src)) continue;

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
    this._posterFailed.clear();
  }

  _queueSensorPosterWork(items) {
    if (!Array.isArray(items) || !items.length) return;
    if (this.config?.source_mode !== "sensor" && this.config?.source_mode !== "combined") return;

    for (const it of items) {
      const src = String(it?.src || "");
      if (!src) continue;
      if (!isVideo(src)) continue;
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

    // Don't use the `autoplay` attribute — when the browser starts an
    // internal play() because of `autoplay=true` and we then change `src`,
    // the internal play() promise rejects with `aborted by the user agent`
    // and surfaces as `Uncaught (in promise) DOMException`. We start
    // playback explicitly via `canplay` below and own the .catch.
    video.autoplay = false;
    video.muted = shouldMute;

    if (video.src !== selectedUrl) {
      // Cancel any in-flight load on the previous src before swapping. Without
      // this, Firefox surfaces the browser-internal fetch abort as
      // `Uncaught (in promise) DOMException: aborted by the user agent` —
      // harmless, but it spams the console on every quick thumb-to-thumb tap.
      if (video.src) {
        try { video.pause(); } catch (_) {}
        try { video.removeAttribute("src"); video.load(); } catch (_) {}
      }

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

  _scheduleVisibleMediaWork(selected, filtered, idx, usingMediaSource) {
    const selectedSrc = String(selected || "");
    const cap = (this.config?.max_media ?? DEFAULT_MAX_MEDIA);
    const thumbRenderLimit = this._getThumbRenderLimit(cap, usingMediaSource);

    const visibleThumbIds = usingMediaSource
      ? filtered
          .slice(0, thumbRenderLimit)
          .map((x) => String(x?.src || ""))
          .filter((src) => src && isMediaSourceId(src))
      : [];

    const key = JSON.stringify({
      selectedSrc,
      visibleThumbIds,
      usingMediaSource: !!usingMediaSource,
    });

    const selectedNeedsResolve = usingMediaSource
      && selectedSrc
      && isMediaSourceId(selectedSrc)
      && !this._mediaClient.getUrlCache().has(selectedSrc);

    if (this._prefetchKey === key && !selectedNeedsResolve) return;
    this._prefetchKey = key;

    queueMicrotask(() => {
      if (!this.isConnected) return;

      if (usingMediaSource) {
        const want = [];

        // Selected clip first (needed for preview)
        if (selectedSrc && isMediaSourceId(selectedSrc)) {
          want.push(selectedSrc);
        }

        // For Frigate: snapshot IDs before clip IDs — snapshots are needed for thumbnail display,
        // clips are only needed when the user clicks to play
        if (hasFrigateConfig(this.config)) {
          for (const src of visibleThumbIds) {
            if (src === selectedSrc) continue;
            const snapId = this._mediaClient.findMatchingSnapshotMediaId(src);
            if (snapId && !this._mediaClient.getUrlCache().has(snapId) && !this._mediaClient.isResolveFailed(snapId)) {
              want.push(snapId);
            }
          }
        }

        // Paired jpg thumbnails: resolve jpg before video so thumbnail is ready first
        if (this._mediaClient.getPairedThumbs().size) {
          for (const src of visibleThumbIds) {
            if (src === selectedSrc) continue;
            const pairedJpgId = this._mediaClient.getPairedThumbs().get(src);
            if (pairedJpgId && !this._mediaClient.getUrlCache().has(pairedJpgId) && !this._mediaClient.isResolveFailed(pairedJpgId)) {
              want.push(pairedJpgId);
            }
          }
        }

        for (const src of visibleThumbIds) {
          if (src !== selectedSrc) want.push(src);
        }

        if (want.length) {
          this._mediaClient.queueResolve(want);
        }
      }

      this._selectedPreviewSrc = selectedSrc;
    });
  }

  _getAllLiveCameraEntities() {
    const states = this._hass?.states || {};
    const allowed = this.config?.live_camera_entities;

    // Geen expliciete cameras geconfigureerd = geen live cameras
    if (!allowed?.length) return [];

    return Object.keys(states)
      .filter((entityId) => entityId.startsWith("camera."))
      .filter((entityId) => {
        const st = states[entityId];
        if (!st) return false;

        if (!allowed.includes(entityId)) return false;

        return true;
      })
      .sort((a, b) => {
        const an = this._friendlyCameraName(a).toLowerCase();
        const bn = this._friendlyCameraName(b).toLowerCase();
        return an.localeCompare(bn, resolveLocale(this._hass));
      });
  }

  _thumbCanMultipleDelete() {
    const mode = this.config?.source_mode;
    if (mode !== "sensor" && mode !== "combined") return false;
    if (!this.config?.allow_delete || !this.config?.allow_bulk_delete) return false;
    return !!parseServiceParts(this.config?.delete_service);
  }

  _friendlyCameraName(entityId) {
    const id = String(entityId || "").trim();
    if (!id) return "";
    if (id.startsWith("__cgc_stream")) { const se = this._getStreamEntryById(id); return se ? se.name : "Stream"; }

    const st = this._hass?.states?.[id];
    const friendly = String(st?.attributes?.friendly_name || "").trim();
    if (friendly) return friendly;

    const raw = id.split(".").pop() || id;
    const label = raw.replace(/_/g, " ").trim();
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : id;
  }

  _isThumbLayoutVertical() {
    return this.config?.thumb_layout === "vertical";
  }

  // Options bag for the pure datetime-parsing functions.
  // Reads config + resolveName each access; cheap allocation, no caching needed.
  get _dtOpts() {
    return {
      folderFormat: this.config?.folder_datetime_format,
      filenameFormat: this.config?.filename_datetime_format,
      resolveName: this.__dtResolveName,
    };
  }

  // Resolve the best dtMs we know for a src. Order:
  //   1. Authoritative timestamp attached at the source (e.g., Frigate REST
  //      _loadFrigateApi sets dtMs from start_time).
  //   2. Frigate event-id epoch parsed from the URI itself (covers walk
  //      partial-load before the post-walk enrichment runs, plus any path
  //      that wasn't routed through _ms.list).
  //   3. User-format parsing of the filename / folder.
  // Returns null when nothing matches.
  _resolveItemMs(src) {
    const pre = this._mediaClient.getDtMsForId(src);
    if (pre !== null) return pre;
    const fid = frigateEventIdMs(src);
    if (typeof fid === "number" && Number.isFinite(fid)) return fid;
    const parsed = dtMsFromSrc(src, this._dtOpts);
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
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
    if (this.config?.persistent_controls || this._pillsHovered) {
      clearTimeout(this._pillsTimer);
      this._pillsTimer = null;
      this._pillsHideActive = false;
      this.requestUpdate();
      return;
    }
    // If a hover-leave hide-timer is already running, don't cancel it
    if (this._pillsHideActive) {
      this.requestUpdate();
      return;
    }
    clearTimeout(this._pillsTimer);
    this._pillsTimer = setTimeout(() => {
      this._pillsHideActive = false;
      if (!this._showLivePicker && !this.config?.persistent_controls && !this._pillsHovered && !this._hamburgerOpen) {
        this._pillsVisible = false;
        this.requestUpdate();
      }
    }, duration);
    this.requestUpdate();
  }

  _showPillsHover() {
    this._pillsHovered = true;
    this._pillsHideActive = false;
    clearTimeout(this._pillsTimer);
    this._pillsTimer = null;
    this._pillsVisible = true;
    this.requestUpdate();
  }

  _hidePillsHover() {
    this._pillsHovered = false;
    if (this._showLivePicker || this.config?.persistent_controls) return;
    clearTimeout(this._pillsTimer);
    this._pillsHideActive = true;
    this._pillsTimer = setTimeout(() => {
      this._pillsHideActive = false;
      if (!this._showLivePicker && !this._pillsHovered && !this._hamburgerOpen) {
        this._pillsVisible = false;
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
    if (this._getStreamEntries().length > 0) return true;
    return this._getLiveCameraOptions().length > 0;
  }

  _isLiveActive() {
    return this._hasLiveConfig() && this._viewMode === "live";
  }

  // ─── Live helpers ─────────────────────────────────────────────────

  _openDatePicker(days) {
    this._datePickerDays = days;
    this._showDatePicker = true;
    this.requestUpdate();
  }

  _closeDatePicker() {
    this._showDatePicker = false;
    this._datePickerDays = null;
    this.requestUpdate();
  }

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
    player.style.cssText = `display:block;width:100%;height:100%;margin:0;object-fit:cover;`;

    this._liveCard = player;
    this._liveCardConfigKey = key;
    return player;
  }

  async _ensureLiveCardFromUrl(url) {
    const key = `stream:${url}`;
    if (this._liveCard && this._liveCardConfigKey === key) {
      return this._liveCard;
    }

    // De-dup concurrent calls for the same URL. Without this, every Lit
    // `updated()` cycle that runs before the WS handshake completes spawns
    // a fresh PC + WS. The cleanup below then closes the previous in-flight
    // PC, surfacing as `DOMException: Peer connection is closed` from the
    // earlier call's `onopen`. Single in-flight promise per URL fixes both
    // the noise and the cascade.
    if (this._liveCardPending?.key === key) {
      return this._liveCardPending.promise;
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

    const promise = this._ensureLiveCardFromUrlImpl(url, key);
    this._liveCardPending = { key, promise };
    try {
      return await promise;
    } finally {
      if (this._liveCardPending?.key === key) this._liveCardPending = null;
    }
  }

  async _ensureLiveCardFromUrlImpl(url, key) {
    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.setAttribute('muted', '');
    video.playsInline = true;
    video.controls = false;
    video.style.cssText = `display:block;width:100%;height:100%;margin:0;object-fit:cover;`;

    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      this._rtcPeerConnection = pc;

      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      pc.ontrack = (e) => {
        if (e.streams?.[0]) video.srcObject = e.streams[0];
      };

      // Gebruik HA ingebouwde go2rtc (auth/sign_path) of externe go2rtc instantie
      const go2rtcBase = this._getGo2rtcUrl();
      let wsUrl;
      let pathLabel;
      if (go2rtcBase) {
        wsUrl = go2rtcBase.replace(/^http/, "ws") + "/api/webrtc?src=" + encodeURIComponent(url);
        pathLabel = "external go2rtc";
      } else {
        const now = Date.now();
        if (!this._signedWsPath || now - this._signedWsPathTs > 25_000) {
          const signed = await this._hass.callWS({ type: "auth/sign_path", path: "/api/webrtc/ws" });
          this._signedWsPath = signed.path;
          this._signedWsPathTs = now;
        }
        wsUrl = "ws" + this._hass.hassUrl(this._signedWsPath).substring(4) + "&url=" + encodeURIComponent(url);
        pathLabel = "AlexxIT/WebRTC integration";
      }

      // Mixed-content: the page is HTTPS but the configured go2rtc URL is HTTP.
      // Browsers silently block this and only fire `onerror` with no detail —
      // surface the diagnosis here so the user knows what to fix.
      if (
        typeof location !== "undefined" &&
        location.protocol === "https:" &&
        wsUrl.startsWith("ws://")
      ) {
        throw new Error(
          `Mixed content blocked: page is HTTPS but live_go2rtc_url uses http://. ` +
          `Either configure go2rtc behind a TLS reverse proxy (https://) or ` +
          `serve the dashboard from http://. URL: ${go2rtcBase}`
        );
      }

      const ws = new WebSocket(wsUrl);
      this._rtcWebSocket = ws;

      await new Promise((resolve, reject) => {
        // `onerror` fires without detail before `onclose`; track the most
        // recent close code so the rejection can include it.
        let lastCloseCode = null;
        const failPrefix = `${pathLabel} WS`;
        const fail = (suffix) =>
          reject(
            new Error(
              `${failPrefix} ${suffix}` +
              (lastCloseCode !== null ? ` (close code ${lastCloseCode})` : "") +
              ` — url: ${wsUrl.replace(/authSig=[^&]+/, "authSig=…")}`
            )
          );
        const timeout = setTimeout(() => fail("timeout after 10s"), 10000);

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
              reject(new Error(`${pathLabel} reported: ${msg.value}`));
            }
          } catch (err) { reject(err); }
        };

        ws.onerror = () => { clearTimeout(timeout); fail("error"); };
        ws.onclose = (e) => {
          lastCloseCode = e.code;
          if (e.code !== 1000) { clearTimeout(timeout); fail("closed"); }
        };
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

  _getGo2rtcUrl() {
    return String(this.config?.live_go2rtc_url || "").trim();
  }

  _getEffectiveLiveCamera() {
    const selected = String(this._liveSelectedCamera || "").trim();
    if (selected) return selected;

    const options = this._getLiveCameraOptions();
    const preferred = String(this.config?.live_camera_entity || "").trim();
    if (preferred && options.includes(preferred)) return preferred;
    return options[0] || "";
  }

  _getStreamEntries() {
    const urls = this.config?.live_stream_urls;
    if (Array.isArray(urls) && urls.length > 0) {
      return urls
        .filter(e => e && String(e.url || "").trim())
        .map((e, i) => ({ id: `__cgc_stream_${i}__`, url: String(e.url).trim(), name: String(e.name || "").trim() || `Stream ${i + 1}` }));
    }
    if (this.config?.live_stream_url) {
      return [{ id: "__cgc_stream_0__", url: this.config.live_stream_url, name: this.config.live_stream_name || "Stream" }];
    }
    return [];
  }

  _getStreamEntryById(id) {
    const sid = String(id || "");
    if (!sid.startsWith("__cgc_stream")) return null;
    const entries = this._getStreamEntries();
    // exact match first, then fallback __cgc_stream__ → index 0
    return entries.find(e => e.id === sid) || (sid === "__cgc_stream__" ? (entries[0] || null) : null);
  }

  _getLiveCameraOptions() {
    const entities = this._getAllLiveCameraEntities();
    const streamIds = this._getStreamEntries().map(e => e.id);
    return [...streamIds, ...entities];
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

  _setupAutoAspectRatio() {
    if (this._autoAspectObs) {
      clearInterval(this._autoAspectObs);
      this._autoAspectObs = null;
    }
    this._autoAspectVideo = null;

    const applyRatio = (video) => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;
      const next = `${w}/${h}`;
      if (next === this._aspectRatio) return;
      this._aspectRatio = next;
      this.requestUpdate();
    };

    const tryBind = () => {
      const video = this._findLiveVideo();
      if (!video || video === this._autoAspectVideo) return !!video;
      this._autoAspectVideo = video;
      if (video.videoWidth && video.videoHeight) {
        applyRatio(video);
      } else {
        video.addEventListener('loadedmetadata', () => applyRatio(video), { once: true });
      }
      return true;
    };

    if (!tryBind()) {
      let elapsed = 0;
      this._autoAspectObs = setInterval(() => {
        elapsed += 500;
        if (tryBind() || elapsed >= 10000) {
          clearInterval(this._autoAspectObs);
          this._autoAspectObs = null;
        }
      }, 500);
    }
  }

  _parseAspectRatio(val) {
    const map = { "16:9": "16/9", "4:3": "4/3", "1:1": "1/1" };
    return map[val] || "16/9";
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

  _getZoomHost() {
    if (this._isLiveActive()) return this.renderRoot?.querySelector('#live-card-host');
    if (this._previewOpen) return this.renderRoot?.querySelector('#preview-video-host')
                                ?? this.renderRoot?.querySelector('.pimg');
    return null;
  }

  _clampZoomPan() {
    const host = this._getZoomHost();
    if (!host) return;
    const maxX = host.offsetWidth * (this._zoomScale - 1) / 2;
    const maxY = host.offsetHeight * (this._zoomScale - 1) / 2;
    this._zoomPanX = Math.max(-maxX, Math.min(maxX, this._zoomPanX));
    this._zoomPanY = Math.max(-maxY, Math.min(maxY, this._zoomPanY));
  }

  _applyZoom() {
    const host = this._getZoomHost();
    const preview = this.renderRoot?.querySelector('.preview');
    if (!host) {
      if (preview) { preview.style.touchAction = ''; preview.style.cursor = ''; }
      return;
    }
    if (this._zoomScale <= 1) {
      host.style.transform = '';
      host.style.transformOrigin = '';
      if (this._isLiveActive()) host.style.cursor = '';
      if (preview) { preview.style.touchAction = ''; preview.style.cursor = ''; }
    } else {
      host.style.transformOrigin = 'center center';
      host.style.transform = `translate(${this._zoomPanX}px, ${this._zoomPanY}px) scale(${this._zoomScale})`;
      if (this._isLiveActive()) host.style.cursor = this._zoomIsPanning ? 'grabbing' : 'grab';
      if (preview) {
        preview.style.touchAction = 'none';
        preview.style.cursor = this._zoomIsPanning ? 'grabbing' : 'grab';
      }
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
    const syncEntity = this.config?.sync_entity;
    if (!syncEntity || !syncEntity.startsWith("input_text.")) return;
    if (!src || src === this._lastSyncedSrc) return;
    this._lastSyncedSrc = src;
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

  _showMicError(msg) {
    this._micErrorMsg = msg;
    this.requestUpdate();
    clearTimeout(this._micErrorTimer);
    this._micErrorTimer = setTimeout(() => { this._micErrorMsg = null; this.requestUpdate(); }, 8000);
    console.error("[CGC] Mic error:", msg);
    try {
      this._hass.callService("persistent_notification", "create", {
        title: "CGC mic error",
        message: msg,
        notification_id: "cgc_mic_error"
      });
    } catch (_) {}
  }

  async _toggleMic() {
    if (this._liveMicActive) {
      this._stopMicStream();
      return;
    }

    const streamName = this.config?.live_go2rtc_stream;
    if (!streamName) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      this._showMicError("HTTPS vereist voor microfoon");
      return;
    }

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this._micStream = micStream;

      const data = await this._hass.callWS({ type: "auth/sign_path", path: "/api/webrtc/ws" });
      const wsUrl = "ws" + this._hass.hassUrl(data.path).substring(4) + "&url=" + encodeURIComponent(streamName);

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
          { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turns:openrelay.metered.ca:443?transport=tcp"], username: "openrelay", credential: "openrelay" }
        ]
      });
      this._micPeerConnection = pc;

      const audioTrack = micStream.getAudioTracks()[0];
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver(audioTrack, { direction: "sendonly" });

      const ws = new WebSocket(wsUrl);
      this._micWebSocket = ws;

      pc.oniceconnectionstatechange = () => console.log("[CGC] ICE state:", pc.iceConnectionState);
      pc.onconnectionstatechange = () => console.log("[CGC] PC state:", pc.connectionState);

      // ICE kandidaten doorsturen — WebSocket blijft open (zoals video-rtc.js)
      pc.onicecandidate = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const candidate = e.candidate ? e.candidate.candidate : "";
        console.log("[CGC] Sending ICE:", candidate || "(end-of-candidates)");
        ws.send(JSON.stringify({ type: "webrtc/candidate", value: candidate }));
      };

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("go2rtc mic WS timeout")), 10000);

        ws.onopen = async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log("[CGC] Offer SDP audio:", offer.sdp.split('\n').filter(l => l.startsWith('m=') || l.startsWith('a=rtpmap') || l.startsWith('a=sendonly') || l.startsWith('a=recvonly')).join(' | '));
            ws.send(JSON.stringify({ type: "webrtc/offer", value: pc.localDescription.sdp }));
          } catch (err) { reject(err); }
        };

        ws.onmessage = async (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === "webrtc/answer") {
              console.log("[CGC] Answer SDP:", msg.value);
              await pc.setRemoteDescription({ type: "answer", sdp: msg.value });
              clearTimeout(timeout);
              resolve();
            } else if (msg.type === "webrtc/candidate") {
              if (msg.value) {
                pc.addIceCandidate({ candidate: msg.value, sdpMid: "0" }).catch(() => {});
              }
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

      this._liveMicActive = true;
      this.requestUpdate();

    } catch (err) {
      console.warn("[CGC] Two-way audio failed:", err);
      this._showMicError("Mic mislukt: " + err.message);
      this._stopMicStream();
    }
  }

  async _mountLiveCard() {
    if (!this._isLiveActive()) return;

    const host = this.renderRoot?.querySelector("#live-card-host");
    if (!host) return;

    const effectiveCam = this._getEffectiveLiveCamera();
    const streamEntry = this._getStreamEntryById(effectiveCam);
    const isStreamUrl = !!streamEntry;
    const card = isStreamUrl
      ? await this._ensureLiveCardFromUrl(streamEntry.url)
      : await this._ensureLiveCard();
    if (!card) return;

    const isNewMount = card.parentElement !== host;

    if (isNewMount) {
      host.innerHTML = "";
      host.appendChild(card);
    }

    // stateObj alleen updaten bij entity-modus
    if (!isStreamUrl) {
      const entity = this._getEffectiveLiveCamera();
      const newStateObj = this._hass?.states?.[entity];
      if (newStateObj?.last_changed !== card.stateObj?.last_changed) {
        card.stateObj = newStateObj;
      }
    }

    // Style-injectie alleen bij nieuwe mount (timers + MutationObserver doen de rest)
    if (isNewMount) {
      card.hass = this._hass;
      this._injectLiveFillStyle(card);
      this._liveMuted = this.config?.live_auto_muted !== false;
      this._syncLiveMuted();
    }

    // Altijd opnieuw uitvoeren: _setViewMode reset _aspectRatio naar config-waarde,
    // ook als de stream al pre-warmed was en de video al dimensies heeft.
    this._setupAutoAspectRatio();
  }

  async _warmupLiveCard() {
    if (!this._hasLiveConfig()) return;
    const host = this.renderRoot?.querySelector("#live-card-host");
    if (!host) return;

    const effectiveCam = this._getEffectiveLiveCamera();
    const streamEntry = this._getStreamEntryById(effectiveCam);
    const card = streamEntry
      ? await this._ensureLiveCardFromUrl(streamEntry.url)
      : await this._ensureLiveCard();
    if (!card) return;

    if (card.parentElement !== host) {
      host.innerHTML = "";
      host.appendChild(card);
      card.hass = this._hass;
      this._injectLiveFillStyle(card);
      this._liveMuted = this.config?.live_auto_muted !== false;
      this._syncLiveMuted();
    }
    this._setupAutoAspectRatio();
  }

  _injectLiveFillStyle(card) {
    const cssFill = `
      :host { display:block!important; width:100%!important; height:100%!important; }
      .image-container { width:100%!important; height:100%!important; }
      .ratio { padding-bottom:0!important; padding-top:0!important; width:100%!important; height:100%!important; position:relative!important; }
      img, video, ha-hls-player, ha-web-rtc-player, ha-camera-stream { width:100%!important; height:100%!important; object-fit:cover!important; display:block!important; position:static!important; }
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
    const effectiveCam = this._getEffectiveLiveCamera();
    const isStreamUrl = !!this._getStreamEntryById(effectiveCam);
    if (!isStreamUrl) {
      const entity = effectiveCam;
      if (!entity) {
        return html`<div class="preview-empty">No live camera configured.</div>`;
      }
      const st = this._hass?.states?.[entity];
      if (!st) {
        return html`<div class="preview-empty">Camera entity not found: ${entity}</div>`;
      }
      const camState = st.state ?? "";
      if (camState === "unavailable" || camState === "unknown") {
        const picUrl = "";
        return html`
          <div class="live-offline">
            ${picUrl ? html`<img class="live-offline-img" src="${picUrl}" alt="" />` : html``}
            <div class="live-offline-badge">
              <ha-icon icon="mdi:camera-off"></ha-icon>
              <span>${this._friendlyCameraName(entity)}</span>
              <span class="live-offline-state">Offline</span>
            </div>
          </div>
        `;
      }
    }

    return html`
      <div class="live-stage">
        ${this._renderLivePicker()}
      </div>
    `;
  }

  _renderDatePicker() {
    if (!this._showDatePicker) return html``;
    const days = this._datePickerDays || [];

    const groups = new Map();
    for (const day of days) {
      const [y, m] = day.split("-");
      const key = `${y}-${m}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(day);
    }

    const selected = this._selectedDay;

    return html`
      <div class="live-picker-backdrop" @click=${() => this._closeDatePicker()}></div>
      <div class="live-picker date-picker" @click=${(e) => e.stopPropagation()}>
        <div class="live-picker-head">
          <div class="live-picker-title">Select date</div>
          <button class="live-picker-close" @click=${() => this._closeDatePicker()} title="Close" aria-label="Close">
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
        </div>
        <div class="live-picker-list">
          ${[...groups.entries()].map(([monthKey, monthDays]) => html`
            <div class="dp-month-header">
              ${formatMonth(monthKey, this._hass?.locale)}
            </div>
            ${monthDays.map((day) => {
              const isSel = day === selected;
              return html`
                <button
                  class="live-picker-item ${isSel ? "on" : ""}"
                  @click=${() => {
                    this._selectedDay = day;
                    this._selectedIndex = 0;
                    this._pendingScrollToI = null;
                    this._forceThumbReset = true;
                    this._exitSelectMode();
                    if (this.config?.clean_mode) this._previewOpen = false;
                    this._closeDatePicker();
                  }}
                >
                  <span class="dp-day-label">${formatDay(day, this._hass?.locale)}</span>
                  ${isSel ? html`<ha-icon class="live-picker-check" icon="mdi:check"></ha-icon>` : html``}
                </button>
              `;
            })}
          `)}
        </div>
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
    this._liveWarmedUp = false;
    this._signedWsPath = null;
    this._liveSelectedCamera = next;

    this._aspectRatio = this._parseAspectRatio(this.config?.aspect_ratio);

    this._showLivePicker = false;
    this.requestUpdate();

    await this.updateComplete;
    this._mountLiveCard();
  }

  _navLiveCamera(dir) {
    const options = this._getLiveCameraOptions();
    if (options.length <= 1) return;
    const current = this._getEffectiveLiveCamera();
    const idx = options.indexOf(current);
    const next = options[(idx + dir + options.length) % options.length];
    this._selectLiveCamera(next);
    this._showPills();
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
      this._resetZoom();
      this._aspectRatio = this._parseAspectRatio(this.config?.aspect_ratio);
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
      this._showPills(2500);
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

    actions.sort((a, b) => a.label.localeCompare(b.label, resolveLocale(this._hass)));
    return actions;
  }

  async _handleThumbAction(actionId, item) {
    if (!item?.src) return;

    const usingMediaSource = this.config?.source_mode === "media" || this.config?.source_mode === "combined";
    const isMs = usingMediaSource && isMediaSourceId(item.src);

    let url = item.src;
    if (isMs) {
      url = this._mediaClient.getUrlCache().get(item.src) || "";
      if (!url) {
        try {
          url = await this._mediaClient.resolve(item.src);
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
      isMediaSourceId(src) &&
      isFrigateRoot(src)
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
    return canDeleteItem({
      src: item?.src,
      config: this.config,
      srcEntityMap: this._sensorClient.getSrcEntityMap(),
    });
  }

  _thumbCanDownload(item) {
    return !!item?.src;
  }

  _thumbMenuCanAcceptTap() {
    return Date.now() - (this._thumbMenuOpenedAt || 0) > 700;
  }

  // ─── Media / delete / download ────────────────────────────────────

  async _deleteSingle(src) {
    const ok = await deleteItem({
      hass: this._hass,
      src,
      config: this.config,
      srcEntityMap: this._sensorClient.getSrcEntityMap(),
    });
    if (!ok) return;

    this._deleted.add(src);
    this._selectedSet?.delete?.(src);

    const rawItems = this._items();
    if (!rawItems.length) {
      this._selectedIndex = 0;
    }

    this.requestUpdate();
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

  _queueSnapshotResolveForVisibleThumbs(items) {
    if (!Array.isArray(items) || !items.length) return;
    if (!hasFrigateConfig(this.config)) return;

    const snapshotIds = [];

    for (const it of items) {
      const src = String(it?.src || "");
      if (!src || !isMediaSourceId(src)) continue;

      const snapshotId = this._mediaClient.findMatchingSnapshotMediaId(src);
      if (snapshotId) snapshotIds.push(snapshotId);
    }

    if (snapshotIds.length) {
      this._mediaClient.queueResolve(snapshotIds);
    }
  }

  // ─── Poster helpers ───────────────────────────────────────────────

  // Resolve the poster URL to render for a video thumb.
  // Side effects: enqueues poster capture / snapshot resolution when needed.
  _resolveVideoPoster(it, isMs, thumbUrl, tThumb, selectedUrl) {
    if (!isMs) {
      const pairedJpg = this._sensorClient.getSensorPairedThumbs().get(it.src);
      if (pairedJpg) return this._posterCache.get(pairedJpg) || "";
      return this._posterCache.get(it.src) || "";
    }

    if (hasFrigateConfig(this.config)) {
      const snapshotId = this._mediaClient.findMatchingSnapshotMediaId(it.src);
      if (snapshotId) {
        const snapshotUrl = this._mediaClient.getUrlCache().get(snapshotId) || "";
        if (snapshotUrl) return snapshotUrl;
        this._mediaClient.queueResolve([snapshotId]);
      }
    }

    // Paired thumbnail: same-stem jpg next to the mp4
    const pairedJpgId = this._mediaClient.getPairedThumbs().get(it.src);
    if (pairedJpgId && !this._mediaClient.isResolveFailed(pairedJpgId)) {
      const jpgUrl = this._mediaClient.getUrlCache().get(pairedJpgId) || "";
      if (jpgUrl) {
        const cached = this._posterCache.get(jpgUrl);
        if (cached) return cached;
        this._enqueuePoster(jpgUrl);
        return "";
      }
      this._mediaClient.queueResolve([pairedJpgId]);
      return "";
    }

    // Skip poster-capture for the URL that's currently loading as the preview —
    // double-loading the same MS URL blocks autoplay on some browsers, and the
    // preview's `canplay` handler in `_ensurePreviewVideoHostPlayback` enqueues
    // the poster once the preview itself has the data.
    //
    // In live mode the preview shows the live feed instead of the selected
    // video, so that handler never fires for `selectedUrl` — the selected
    // thumb would stay blank until the user leaves live mode. Treat the
    // "preview owns this URL's poster" exemption as not applying in live mode.
    const previewOwnsSelectedPoster = !this._isLiveActive();
    for (const url of [tThumb, thumbUrl]) {
      if (!url) continue;
      const cached = this._posterCache.get(url);
      if (cached) return cached;
      const skipForPreview = previewOwnsSelectedPoster && url === selectedUrl;
      if (!skipForPreview) this._enqueuePoster(url);
      return "";
    }
    return "";
  }

  _captureFrame(src, pct = 0) {
    return new Promise((resolve, reject) => {
      const v = document.createElement("video");
      v.muted = true;
      v.setAttribute("muted", "");
      v.playsInline = true;
      v.preload = "metadata";

      let timeout;
      const cleanup = () => {
        clearTimeout(timeout);
        try { v.pause(); v.removeAttribute("src"); v.load(); } catch (_) {}
      };
      const fail = (err) => { cleanup(); reject(err ?? new Error("poster fail")); };

      const draw = () => {
        try {
          const w = v.videoWidth, h = v.videoHeight;
          if (!w || !h) return fail(new Error("no video dimensions"));
          const scale = Math.min(1, 320 / w);
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(w * scale));
          c.height = Math.max(1, Math.round(h * scale));
          c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
          cleanup();
          resolve(c.toDataURL("image/jpeg", 0.6));
        } catch (e) {
          fail(e);
        }
      };

      timeout = setTimeout(() => fail(new Error("poster timeout")), 3000);
      v.addEventListener(
        "error",
        () => {
          const err = new Error("video load error");
          // MediaError.code: 2 = NETWORK (often 404), 4 = SRC_NOT_SUPPORTED
          // (usually codec but browsers also report 4 for missing files).
          // _ensurePoster uses this to decide whether to drop a stale
          // localStorage thumb.
          err.mediaErrorCode = v.error?.code;
          fail(err);
        },
        { once: true }
      );
      v.addEventListener("loadedmetadata", () => {
        const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
        const p = Math.max(0, Math.min(100, Number(pct) || 0));
        // Seek slightly off the boundaries — exact 0 or duration often yields no frame.
        let t = 0.01;
        if (dur && p > 0) t = p === 100 ? Math.max(0.01, dur - 0.05) : dur * (p / 100);
        try { v.currentTime = t; } catch (_) { draw(); }
      }, { once: true });
      v.addEventListener("seeked", () => draw(), { once: true });

      v.src = src;
      try { v.load(); } catch (_) {}
    });
  }

  // Salt the localStorage key with the current frame %, so changing the % invalidates
  // cached frames without needing to wipe storage.
  _lsKey(url) {
    const pct = this.config?.thumbnail_frame_pct ?? DEFAULT_THUMBNAIL_FRAME_PCT;
    return "cgc_p_" + fnv1aHash(url + "|" + pct);
  }

  _lsThumbGet(url) {
    try {
      return localStorage.getItem(this._lsKey(url)) || null;
    } catch (_) { return null; }
  }

  _lsThumbSet(url, dataUrl) {
    try {
      const key = this._lsKey(url);
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

  // Drops a cached thumbnail for a URL. Used when the underlying file is
  // confirmed missing (HTTP 404 / MediaError NETWORK) so a deleted file's
  // stale localStorage thumb stops being shown on next render.
  _lsThumbDelete(url) {
    try {
      const key = this._lsKey(url);
      const indexKey = "cgc_poster_index";
      const index = JSON.parse(localStorage.getItem(indexKey) || "[]");
      const idx = index.indexOf(key);
      if (idx >= 0) {
        index.splice(idx, 1);
        localStorage.setItem(indexKey, JSON.stringify(index));
      }
      localStorage.removeItem(key);
    } catch (_) {}
  }

  async _fetchProtectedAsDataUrl(src) {
    const token = this._hass?.auth?.data?.access_token;
    if (!token) return null;
    const res = await fetch(window.location.origin + src, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) {
      // Throw with a marker so _ensurePoster can drop the stale localStorage
      // thumb for files that have been deleted on disk.
      const err = new Error("not found");
      err.status = 404;
      throw err;
    }
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  async _ensurePoster(src) {
    if (!src || this._posterCache.has(src) || this._posterPending.has(src)) return;
    if (this._posterFailed.has(src)) return;

    const cached = this._lsThumbGet(src);
    if (cached) {
      this._posterCache.set(src, cached);
      this.requestUpdate();
      return;
    }

    this._posterPending.add(src);
    try {
      // Auth-protected HA image thumbnails (browse_media) need a Bearer fetch.
      // Videos always go through _captureFrame to extract a still — never base64 the file.
      const dataUrl = src.startsWith("/") && !isVideo(src)
        ? await this._fetchProtectedAsDataUrl(src)
        : await this._captureFrame(
            src,
            this.config?.thumbnail_frame_pct ?? DEFAULT_THUMBNAIL_FRAME_PCT
          );
      if (dataUrl) {
        this._posterCache.set(src, dataUrl);
        this._lsThumbSet(src, dataUrl);
      } else {
        // Reached the !res.ok branch in _fetchProtectedAsDataUrl (non-404
        // failure). Don't keep retrying every render.
        this._posterFailed.add(src);
      }
    } catch (e) {
      // Hard failure: 404, decode error, timeout, network error. Mark as
      // failed so subsequent renders skip it instead of re-spamming the
      // network/console.
      this._posterFailed.add(src);
      // For confirmed-missing files (HTTP 404, or video URLs that couldn't
      // be loaded over the network) drop any stale localStorage thumb so a
      // deleted file stops displaying its last cached frame.
      const isMissing =
        e?.status === 404 ||
        e?.mediaErrorCode === 2 || // MEDIA_ERR_NETWORK
        e?.mediaErrorCode === 4;   // MEDIA_ERR_SRC_NOT_SUPPORTED
      if (isMissing) this._lsThumbDelete(src);
    } finally {
      this._posterPending.delete(src);
      this.requestUpdate();
    }
  }


  /**
   * @typedef {{ src: string, dtMs?: number }} CardItem
   *
   * Returns the unified list of items the gallery should render. Sources that
   * have an authoritative timestamp (Frigate REST API; Frigate media-source
   * URIs via event-id) attach `dtMs` here so render paths can prefer it over
   * filename/folder parsing. Sensor items have no authoritative timestamp and
   * arrive as `{ src }` only — gallery falls back to path parsing.
   */
  _items() {
    const mode = this.config?.source_mode;
    const usingMediaSource = mode === "media";

    // Resolve the best dtMs each src can yield (source-attached → Frigate
    // event-id parse → user-format parse). Items without a parseable time
    // surface as plain `{ src }`.
    const enrich = (src) => {
      const dtMs = this._resolveItemMs(src);
      return dtMs !== null ? { src, dtMs } : { src };
    };

    if (mode === "combined") {
      const merged = this._combinedClient.getItems(enrich);
      return this._deleted?.size
        ? merged.filter((it) => !this._deleted.has(it.src))
        : merged;
    }

    if (usingMediaSource) {
      const ids = dedupeByRelPath(this._mediaClient.getIds()).map(enrich);
      return this._deleted?.size ? ids.filter((it) => !this._deleted.has(it.src)) : ids;
    }

    // Sensor (and the implicit fall-through default) — delegate.
    // Render-side reads of srcEntityMap / sensorPairedThumbs route through
    // `this._sensorClient.getSrcEntityMap()` and `getSensorPairedThumbs()`
    // directly; no mirror-back needed.
    const items = this._sensorClient.getItems(enrich);
    return this._deleted?.size ? items.filter((it) => !this._deleted.has(it.src)) : items;
  }

  _isVideoSmart(urlOrTitle, mime, cls) {
    const m = String(mime || "").toLowerCase();
    const c = String(cls || "").toLowerCase();
    if (m.startsWith("video/")) return true;
    if (c === "video") return true;
    return isVideo(String(urlOrTitle || ""));
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
    if (!isMediaSourceId(src)) return String(src || "");
    const t = this._mediaClient.getTitleById(src);
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

    if (this.config?.clean_mode) this._previewOpen = false;
    if (this._isLiveActive()) this._setViewMode("media");

    this.requestUpdate();
  }

  _tsLabelFromFilename(src) {
    const name = this._sourceNameForParsing(src);
    if (!name) return "";

    const ms = this._resolveItemMs(src);
    const dtKey = ms !== null ? dtKeyFromMs(ms) : null;
    if (dtKey) return formatDateTime(dtKey, this._hass?.locale);

    const base = name.split("/").pop() || name;
    const noExt = base.replace(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)$/i, "");
    return noExt.length > 42 ? `${noExt.slice(0, 39)}…` : noExt;
  }

  // ─── Object filters ───────────────────────────────────────────────

  _activeObjectFilters() {
    return Array.isArray(this._objectFilters)
      ? this._objectFilters
          .map((x) => String(x || "").toLowerCase().trim())
          .filter(Boolean)
      : [];
  }

  _isObjectFilterActive(value) {
    const v = String(value || "").toLowerCase().trim();
    return this._activeObjectFilters().includes(v);
  }

  _matchesObjectFilter(src) {
    return this._matchesObjectFilterValue(src, this._objectFilters);
  }

  _isVideoForSrc(src) {
    if (isMediaSourceId(src)) {
      const meta = this._mediaClient.getMetaById(src);
      return this._isVideoSmart(meta.title || src, meta.mime, meta.cls);
    }
    return isVideo(src);
  }

  _matchesTypeFilter(src) {
    // both on or both off = show all
    if (this._filterVideo === this._filterImage) return true;
    const isVid = this._isVideoForSrc(src);
    return isVid ? this._filterVideo : this._filterImage;
  }

  _matchesObjectFilterValue(src, filterValues) {
    const active = Array.isArray(filterValues)
      ? filterValues
          .map((x) => String(x || "").toLowerCase().trim())
          .filter(Boolean)
      : [];

    if (!active.length) return true;

    if (this.config?.source_mode === "sensor") {
      const sourceEntity = this._sensorClient.getSrcEntityMap().get(src) || "";
      const sensorStateObj = sourceEntity
        ? this._hass?.states?.[sourceEntity]
        : null;

      return active.some((filter) =>
        matchesObjectFilterForFileSensor(
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

  _objectForSrc(src) {
      const key = String(src || "").trim();
      if (!key) return null;
      if (this._objectCache.has(key)) return this._objectCache.get(key);

      let detected = null;
      
      const activeFilters = this._getVisibleObjectFilters();
      
      let sourceText = "";
      if (this.config?.source_mode === "sensor") {
        const sourceEntity = this._sensorClient.getSrcEntityMap().get(src) || "";
        const sensorStateObj = sourceEntity ? this._hass?.states?.[sourceEntity] : null;
        sourceText = [itemFilenameForFilter(src), sensorTextForFilter(sourceEntity, sensorStateObj)].join(" ");
      } else {
        const meta = this._mediaClient.getMetaById(src);
        sourceText = [meta?.title, src].join(" ");
      }
      sourceText = sourceText.toLowerCase();

      for (const filter of activeFilters) {
        const aliases = getFilterAliases(filter);
        if (aliases.some(alias => sourceText.includes(alias))) {
          detected = filter;
          break;
        }
      }

      this._objectCache.set(key, detected);
      return detected;
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
    const withDt = rawItems.map((it, idx) => {
      const dtMs = Number.isFinite(it.dtMs) ? it.dtMs : null;
      const dayKey = dtMs !== null ? dayKeyFromMs(dtMs) : null;
      return { dayKey, dtMs, idx, src: it.src };
    });

    withDt.sort((a, b) => {
      const aOk = Number.isFinite(a.dtMs);
      const bOk = Number.isFinite(b.dtMs);
      if (aOk && bOk && b.dtMs !== a.dtMs) return b.dtMs - a.dtMs;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return b.idx - a.idx;
    });

    const allWithDay = withDt.map((x) => ({ dayKey: x.dayKey, src: x.src, dtMs: x.dtMs }));
    const days = uniqueDays(allWithDay);
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

  _toggleFilterVideo() {
    this._filterVideo = !this._filterVideo;
    this._selectedIndex = 0;
    this._pendingScrollToI = null;
    this._forceThumbReset = true;
    this.requestUpdate();
  }

  _toggleFilterImage() {
    this._filterImage = !this._filterImage;
    this._selectedIndex = 0;
    this._pendingScrollToI = null;
    this._forceThumbReset = true;
    this.requestUpdate();
  }

  _toggleFilterFavorites() {
    this._filterFavorites = !this._filterFavorites;
    this._selectedIndex = 0;
    this._pendingScrollToI = null;
    this._forceThumbReset = true;
    this.requestUpdate();
  }

  // ─── Selection / bulk delete ──────────────────────────────────────

  async _bulkDelete(selectedSrcList) {
    const mode = this.config?.source_mode;
    if (mode !== "sensor" && mode !== "combined") return;
    if (!this.config?.allow_delete || !this.config?.allow_bulk_delete) return;

    const sp = parseServiceParts(this.config?.delete_service);
    if (!sp) return;

    const prefix = DELETE_PREFIX_NORMALIZED;
    const srcs = Array.from(selectedSrcList || []);
    if (!srcs.length) return;

    if (this.config?.delete_confirm) {
      const ok = window.confirm(
        `Are you sure you want to delete ${srcs.length} file(s)?`
      );
      if (!ok) return;
    }

    for (const src of srcs) {
      const fsPath = toFsPath(src);
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
    this._resetZoom();
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
    this._resetZoom();
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
    if (this._zoomScale > 1) { this._swiping = false; return; }

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

    if (this._zoomIsPinching) {
      this._swiping = false;
      this._zoomIsPinching = false;
      return;
    }

    if (!this._swiping) {
      if (this.config?.clean_mode && !this._previewOpen) return;
      if (this._selectMode) return;
      this._showNavChevrons();
      this._showPills();
      return;
    }

    this._swiping = false;

    if (this.config?.clean_mode && !this._previewOpen) return;

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

    const { config: nextConfig, customIcons } = normalizeConfig(config);

    this.config = nextConfig;
    this._customIcons = customIcons;
    this._favorites.load(this.config);
    this._sensorClient.load(this.config);
    this._mediaClient.load(this.config);
    this._startMediaPoll();

    const { changedKeys, isSourceChange: sourceChange, isUiOnly: uiOnlyChange } =
      configDiff(prevConfig, nextConfig);

    if (this._selectedIndex === undefined) this._selectedIndex = 0;
    if (this._selectedSet == null) this._selectedSet = new Set();
    if (!Array.isArray(this._objectFilters)) this._objectFilters = [];
    if (this._filterVideo == null) this._filterVideo = false;
    if (this._filterImage == null) this._filterImage = false;

    const visibleSet = new Set(this._getVisibleObjectFilters());
    this._objectFilters = this._objectFilters.filter((x) => visibleSet.has(x));

    const liveEntityChanged =
      !prevConfig ||
      prevConfig.live_camera_entity !== nextConfig.live_camera_entity ||
      prevConfig.live_stream_url !== nextConfig.live_stream_url ||
      JSON.stringify(prevConfig.live_stream_urls) !==
        JSON.stringify(nextConfig.live_stream_urls);
    if (liveEntityChanged) {
      const liveOptions = this._getLiveCameraOptions();
      const validSelected =
        this._liveSelectedCamera &&
        liveOptions.some((x) => x === this._liveSelectedCamera);
      if (!validSelected && liveOptions.length > 0) {
        this._liveSelectedCamera =
          (nextConfig.live_camera_entity
            ? nextConfig.live_camera_entity
            : liveOptions[0]) || "";
      }
      if (prevConfig) {
        this._aspectRatio = this._parseAspectRatio(nextConfig.aspect_ratio);
      }
    }

    if (!prevConfig) {
      this._previewOpen = this.config.clean_mode ? false : true;
      this._showLivePicker = false;
      this._showLiveQuickSwitch = false;
      this._aspectRatio = this._parseAspectRatio(nextConfig.aspect_ratio);
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
      prevConfig.clean_mode !== this.config.clean_mode
    ) {
      this._previewOpen = !this.config.clean_mode;
    }

    if (prevConfig && prevConfig.sync_entity !== this.config.sync_entity) {
      this._lastSyncedSrc = null;
    }

    if (sourceChange) {
      this._closeThumbMenu();
      this._forceThumbReset = false;
      this._pendingScrollToI = 0;
      this._previewOpen = !this.config.clean_mode;
      this._selectMode = false;
      this._selectedIndex = 0;
      this._selectedSet.clear();
      this._hideBulkDeleteHint();
      this._resetPosterQueue();
      this._posterCache.clear();
      this._posterPending.clear();
      this._posterFailed.clear();
      this._objectCache.clear();
    }

    const liveCameraConfigChanged = changedKeys.some((k) =>
      ["live_camera_entity", "live_enabled"].includes(k)
    );

    if (liveCameraConfigChanged) {
      this._hideLiveQuickSwitchButton();
      this._liveCard = null;
      this._liveCardConfigKey = "";
      this._liveWarmedUp = false;
      this._signedWsPath = null;
    }

    if (!this._hasLiveConfig()) {
      this._hideLiveQuickSwitchButton();
      this._showLivePicker = false;
      this._viewMode = "media";
    }

    // Roots/frigate_url cache invalidation lives inside MediaSourceClient.load()
    // now (audit B10). Card still has a per-instance object-detection cache
    // that's source-aware but not owned by the data layer.
    if (this.config.source_mode === "media" || this.config.source_mode === "combined") {
      const prevKey = prevConfig ? msKeyFromRoots(prevConfig.media_sources) : "";
      const nextKey = msKeyFromRoots(this.config.media_sources);
      if (!prevConfig || (sourceChange && prevKey !== nextKey)) {
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
      this._mediaClient.clearResolveFailed();
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

    if (changedProps.has("config") && this._previewVideoEl) {
      this._previewVideoEl.autoplay = this.config?.autoplay === true;
      this._previewVideoEl.muted =
        this.config?.auto_muted !== undefined
          ? this.config.auto_muted === true
          : true;
    }

    const usingMediaSource = this.config?.source_mode === "media" || this.config?.source_mode === "combined";
    const rawItems = this._items();

    if (rawItems.length) {
      const withDt = rawItems.map((it, idx) => {
        const dtMs = Number.isFinite(it.dtMs) ? it.dtMs : null;
        const dayKey = dtMs !== null ? dayKeyFromMs(dtMs) : null;
        return { dayKey, dtMs, idx, src: it.src };
      });

      withDt.sort((a, b) => {
        const aOk = Number.isFinite(a.dtMs);
        const bOk = Number.isFinite(b.dtMs);
        if (aOk && bOk && b.dtMs !== a.dtMs) return b.dtMs - a.dtMs;
        if (aOk && !bOk) return -1;
        if (!aOk && bOk) return 1;
        return b.idx - a.idx;
      });

      const allWithDay = withDt.map((x) => ({ dayKey: x.dayKey, src: x.src, dtMs: x.dtMs }));
      const days = uniqueDays(allWithDay);
      const newestDay = days[0] ?? null;
      const activeDay = this._selectedDay ?? newestDay;

      const dayFiltered = !activeDay
        ? allWithDay
        : allWithDay.filter((x) => x.dayKey === activeDay);

      const filteredAll = dayFiltered.filter((x) =>
        this._matchesObjectFilter(x.src)
      );

      const cap = (this.config?.max_media ?? DEFAULT_MAX_MEDIA);
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
      if (!this._liveWarmedUp && this._hasLiveConfig()) {
        this._liveWarmedUp = true;
        this._warmupLiveCard();
      }
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
          const isSensor = this.config?.source_mode === "sensor" || this.config?.source_mode === "combined";
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const key = entry.target.dataset.lazySrc;
              if (key && !this._revealedThumbs.has(key)) {
                this._revealedThumbs.add(key);
                changed = true;
              }
              // Viewport-aware poster prioritization: enqueue only when visible
              if (isSensor && key && isVideo(key)) {
                const pairedJpg = this._sensorClient.getSensorPairedThumbs().get(key);
                this._enqueuePoster(pairedJpg || key);
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

    const usingMediaSource = this.config?.source_mode === "media" || this.config?.source_mode === "combined";
    const thumbRatio = "1 / 1";
    const rawItems = this._items();
    const visibleObjectFilters = this._getVisibleObjectFilters();

    if (!rawItems.length) {
      if (usingMediaSource && this._mediaClient.isLoading()) {
        return html`<div class="empty">Loading media…</div>`;
      }
      return html`<div class="empty">No media found.</div>`;
    }

    const withDt = rawItems.map((it, idx) => {
      const dtMs = Number.isFinite(it.dtMs) ? it.dtMs : null;
      const dayKey = dtMs !== null ? dayKeyFromMs(dtMs) : null;
      return { dayKey, dtMs, idx, src: it.src };
    });

    withDt.sort((a, b) => {
      const aOk = Number.isFinite(a.dtMs);
      const bOk = Number.isFinite(b.dtMs);
      if (aOk && bOk && b.dtMs !== a.dtMs) return b.dtMs - a.dtMs;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return b.idx - a.idx;
    });

    const allWithDay = withDt.map((x) => ({ dayKey: x.dayKey, src: x.src, dtMs: x.dtMs }));
    const days = uniqueDays(allWithDay);
    const newestDay = days[0] ?? null;
    const activeDay = this._selectedDay ?? newestDay;

    const dayFiltered = !activeDay
      ? allWithDay
      : allWithDay.filter((x) => x.dayKey === activeDay);

    const objFiltered = dayFiltered.filter((x) => this._matchesObjectFilter(x.src));
    const videoCount = objFiltered.filter((x) => this._isVideoForSrc(x.src)).length;
    const imageCount = objFiltered.filter((x) => !this._isVideoForSrc(x.src)).length;
    const showTypeFilter = videoCount > 0 && imageCount > 0;
    if (!showTypeFilter) { this._filterVideo = false; this._filterImage = false; }

    const filteredAll = objFiltered.filter((x) =>
      this._matchesTypeFilter(x.src) &&
      (!this._filterFavorites || this._favorites.has(x.src))
    );

    const noResultsForFilter = !filteredAll.length;

    const cap = (this.config?.max_media ?? DEFAULT_MAX_MEDIA);
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
    if (isMediaSourceId(selected)) {
      selectedUrl = this._mediaClient.getUrlCache().get(selected) || "";
    }

    let selectedMime = "";
    let selectedCls = "";
    let selectedTitle = "";
    if (usingMediaSource && isMediaSourceId(selected)) {
      const meta = this._mediaClient.getMetaById(selected);
      selectedMime = meta.mime;
      selectedCls = meta.cls;
      selectedTitle = meta.title;
    }

    const selectedIsVideo =
      !!selected &&
      this._isVideoSmart(selectedUrl || selectedTitle, selectedMime, selectedCls);

    const tsLabel = selected ? this._tsLabelFromFilename(selected) : "";

    const currentForNav = activeDay ?? newestDay;
    const dayIdx = currentForNav ? days.indexOf(currentForNav) : -1;
    const canPrev = dayIdx >= 0 && dayIdx < days.length - 1;
    const canNext = dayIdx > 0;
    const isToday = currentForNav === newestDay;

    const sp = parseServiceParts(this.config?.delete_service);

    const canDelete =
      (this.config?.source_mode === "sensor" || this.config?.source_mode === "combined") &&
      !!this.config?.allow_delete &&
      !!sp;
    const canBulkDelete =
      (this.config?.source_mode === "sensor" || this.config?.source_mode === "combined") &&
      !!this.config?.allow_bulk_delete &&
      !!sp;

    const tsPosClass = this.config.bar_position === "bottom"
      ? "bottom"
      : this.config.bar_position === "hidden"
        ? "hidden"
        : "top";

    const previewGated = !!this.config?.clean_mode;
    const previewOpen = !previewGated || !!this._previewOpen;
    const previewAtBottom = this.config?.preview_position === "bottom";

    const selectedNeedsResolve =
      !!selected && usingMediaSource && isMediaSourceId(selected);
    const selectedHasUrl = !!selected && (!selectedNeedsResolve || !!selectedUrl);

    const showLiveToggle = this._hasLiveConfig();
    const isLive = this._isLiveActive();
    // Live view is always "open" regardless of _previewOpen
    const previewOpenFinal = previewOpen || isLive;
    const showPreviewSection = previewOpenFinal;
    const useDatePicker = showTypeFilter && navigator.maxTouchPoints > 0;
    const isVerticalThumbs = this._isThumbLayoutVertical();

    // DIT IS DE BELANGRIJKE LOGICA: 
    // showGalleryControls is TRUE als we de gallery/navigatie MOETEN zien.
    // showGalleryControls is FALSE als click_to_open aan staat én de preview open is, of als live actief is.
    const showGalleryControls = !this.config?.clean_mode || (!this._previewOpen && !isLive);

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

    const fixedMode = this.config.controls_mode === "fixed";

    const galleryPillsLeft = html`
      <div class="gallery-pills-left">
        ${previewGated ? html`
          <button class="gallery-pill live-pill-btn" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._setViewMode("media"); this._previewOpen = false; this.requestUpdate(); }}>
            <ha-icon icon="mdi:arrow-left"></ha-icon>
          </button>
        ` : html``}
      </div>
    `;
    const galleryPillsCenter = html`
      <div class="gallery-pills-center">
        ${(() => {
          const obj = this._objectForSrc(selected);
          const icon = obj ? objectIcon(obj, this._customIcons, "mdi:magnify") : null;
          if (!icon) return html``;
          return html`<div class="gallery-pill live-pill-btn" style="flex-shrink:0;width:calc(var(--cgc-pill-size,14px)*1.6 + 2px);height:calc(var(--cgc-pill-size,14px)*1.6 + 2px);padding:0"><ha-icon icon="${icon}"></ha-icon></div>`;
        })()}
        <div class="gallery-pill live-pill-btn" style="flex-shrink:0;min-width:calc(var(--cgc-pill-size,14px)*1.6 + 2px);height:calc(var(--cgc-pill-size,14px)*1.6 + 2px);padding:0 8px;overflow:hidden"><span style="font-size:calc(var(--cgc-pill-size,14px) - 6px)">${idx + 1}/${filtered.length}</span></div>
      </div>
    `;
    const galleryPillsRight = html`
      <div class="gallery-pills-right">
        ${!selectedIsVideo && selectedHasUrl && !noResultsForFilter ? html`
          <button class="gallery-pill live-pill-btn" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._openImageFullscreen(); }}>
            <ha-icon icon="mdi:fullscreen"></ha-icon>
          </button>
        ` : html``}
      </div>
    `;
    const livePillsLeft = html`
      <div class="live-pills-left">
        ${previewGated ? html`
          <button class="gallery-pill live-pill-btn" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._setViewMode("media"); this._previewOpen = false; this.requestUpdate(); }}>
            <ha-icon icon="mdi:arrow-left"></ha-icon>
          </button>
        ` : html``}
        ${this.config.show_camera_title !== false && this.config.controls_mode !== "fixed" ? html`<div class="gallery-pill"><span>${this._friendlyCameraName(this._getEffectiveLiveCamera())}</span></div>` : html``}
      </div>
    `;
    const livePillsRight = html`
      <div class="live-pills-right">
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
        ${(this.config.menu_buttons ?? []).length ? html`
          <div class="live-hamburger-wrap" @pointerdown=${(e) => e.stopPropagation()}>
            <button class="gallery-pill live-pill-btn ${this._hamburgerOpen ? 'active' : ''}" @click=${(e) => { e.stopPropagation(); this._hamburgerOpen = !this._hamburgerOpen; if (!this._hamburgerOpen) this._showPills(2500); }}>
              <ha-icon icon="mdi:menu"></ha-icon>
            </button>
          </div>
        ` : html``}
      </div>
    `;
    const hamburgerPanel = (this.config.menu_buttons ?? []).length && this._hamburgerOpen ? html`
      <div class="live-menu-backdrop" @pointerdown=${(e) => e.stopPropagation()} @click=${() => { this._hamburgerOpen = false; this._showPills(2500); }}></div>
      <div class="live-menu-panel" @pointerdown=${(e) => e.stopPropagation()}>
        ${(this.config.menu_buttons ?? []).map(btn => {
          const state = this._hass?.states[btn.entity];
          const stateVal = state?.state ?? "";
          const ON_STATES = new Set(["on","open","opening","unlocked","playing","paused","home","true","heat","cool","heat_cool","fan_only","dry","auto"]);
          const isOn = btn.state_on ? stateVal === btn.state_on : ON_STATES.has(stateVal);
          const domain = btn.entity.split(".")[0];
          const [svcDomain, svcName] = btn.service
            ? btn.service.split(".")
            : domain === "automation" ? ["automation","trigger"]
            : domain === "script"     ? ["script","turn_on"]
            : ["homeassistant","toggle"];
          const icon = (isOn && btn.icon_on) ? btn.icon_on : btn.icon;
          const bg = isOn ? (btn.color_on || "") : (btn.color_off || "");
          const label = btn.title || state?.attributes?.friendly_name || btn.entity;
          return html`
            <button class="live-menu-panel-btn ${isOn ? "active" : ""}"
              @click=${() => this._hass?.callService(svcDomain, svcName, { entity_id: btn.entity })}
              title="${label}">
              <div class="panel-btn-icon" style="${bg ? `background:${bg}` : ""}">
                <ha-icon icon="${icon}"></ha-icon>
              </div>
              <span class="live-menu-panel-lbl">${label}</span>
            </button>
          `;
        })}
      </div>
    ` : html``;

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
            @pointermove=${(e) => { if (e.pointerType === "mouse" && !this._swiping) { this._showNavChevrons(); } if (this._swiping && e.isPrimary !== false) { this._swipeCurX = e.clientX; this._swipeCurY = e.clientY; } }}
            @pointerup=${(e) => this._onPreviewPointerUp(e, filtered.length)}
            @pointercancel=${(e) => this._onPreviewPointerUp(e, filtered.length)}
            @pointerenter=${(e) => { if (e.pointerType === "mouse") { this._showPillsHover(); this._showNavChevrons(); } }}
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
            ${this._hasLiveConfig() ? html`<div id="live-card-host" class="live-card-host${isLive ? '' : ' live-host-hidden'}"></div>` : html``}

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

            ${isLive && this._getLiveCameraOptions().length > 1 && (this._pillsVisible || this.config?.persistent_controls) ? html`
              <div class="pnav">
                <button class="pnavbtn left" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._navLiveCamera(-1); }}>
                  <ha-icon icon="mdi:chevron-left"></ha-icon>
                </button>
                <button class="pnavbtn right" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._navLiveCamera(1); }}>
                  <ha-icon icon="mdi:chevron-right"></ha-icon>
                </button>
              </div>
            ` : html``}

            ${!isLive && !fixedMode && tsPosClass !== "hidden" ? html`
              <div class="gallery-pills ${tsPosClass} ${this._pillsVisible || this.config?.persistent_controls ? "visible" : ""}">
                ${galleryPillsLeft}${galleryPillsCenter}${galleryPillsRight}
              </div>
            ` : html``}
            ${isLive && !fixedMode ? html`
              <div class="live-controls-bar ${tsPosClass} ${this._pillsVisible || this._showLivePicker || this.config?.persistent_controls ? "visible" : ""}">
                <div class="live-controls-main">
                  ${livePillsLeft}${livePillsRight}
                </div>
              </div>
            ` : html``}
            ${isLive ? hamburgerPanel : html``}
          </div>
        `
      : html``;

    const controlsFixedBlock = fixedMode && showPreviewSection ? html`
      <div class="controls-bar-fixed">
        ${isLive ? html`
          <div class="live-controls-main live-controls-main--fixed">
            ${livePillsLeft}${livePillsRight}
          </div>
        ` : tsPosClass !== "hidden" ? html`
          ${galleryPillsLeft}${galleryPillsCenter}${galleryPillsRight}
        ` : html``}
      </div>
    ` : html``;

    const objectFiltersBlock = visibleObjectFilters.length
      ? html`
          <div class="objfilters" role="group" aria-label="Object filters">
            ${visibleObjectFilters.map((filterValue) => {
              const objIcon = objectIcon(filterValue, this._customIcons, "mdi:magnify");
              const label = filterLabel(filterValue);
              const objColor = objectColor(filterValue, this.config?.object_colors ?? {});
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
                    const isMs = usingMediaSource && isMediaSourceId(it.src);

                    let thumbUrl = it.src;
                    if (isMs) thumbUrl = this._mediaClient.getUrlCache().get(it.src) || "";

                    let tMime = "";
                    let tCls = "";
                    let tTitle = "";
                    let tThumb = "";
                    if (isMs) {
                      const meta = this._mediaClient.getMetaById(it.src);
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

                    let poster = isVid
                      ? this._resolveVideoPoster(it, isMs, thumbUrl, tThumb, selectedUrl)
                      : thumbUrl;
                    // For unresolved MS images, use the browse_media thumbnail as fallback
                    // so the thumbnail appears immediately while the full URL is still resolving
                    if (!isVid && !poster && isMs && tThumb) {
                      poster = this._posterCache.get(tThumb) || "";
                      if (!poster) this._enqueuePoster(tThumb);
                    }

                    const needsResolve = isMs;
                    const hasUrl = !needsResolve || !!thumbUrl || !!tThumb || !!poster;
                    // For media source: show as soon as poster is ready — no observer gate needed
                    // because we eagerly resolve all visible items. For sensor mode: keep lazy
                    // reveal via IntersectionObserver to avoid loading off-screen video frames.
                    const showImg = isMs
                      ? (hasUrl && !!poster)
                      : (this._revealedThumbs.has(it.src) && hasUrl && !!poster);

                    const tTime = Number.isFinite(it.dtMs)
                      ? formatTimeFromMs(it.dtMs, this._hass?.locale)
                      : "";

                    const obj = this._objectForSrc(it.src);
                    const objIcon = objectIcon(obj, this._customIcons, "mdi:magnify");
                    const objColor = objectColor(obj, this.config?.object_colors ?? {});

                    const tBarLeft = tTime;

                    const barPos = this.config?.thumb_bar_position || "bottom";
                    const showBar = barPos !== "hidden" && (!!tBarLeft || !!objIcon);
                    const thumbStyle = isVerticalThumbs
                      ? `aspect-ratio:${thumbRatio};border-radius:var(--cgc-thumb-radius, ${THUMB_RADIUS}px);`
                      : `width:${this.config.thumb_size}px;aspect-ratio:${thumbRatio};border-radius:var(--cgc-thumb-radius, ${THUMB_RADIUS}px);`;

                    return html`
                      <button
                        class="tthumb ${isOn ? "on" : ""} ${this._selectMode && isSel ? "sel" : ""} bar-${barPos}"
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

                          if (this.config?.clean_mode) {
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
                                <div class="tbar-left">${tBarLeft || "—"}</div>
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

                        <div
                          class="fav-btn ${this._favorites.has(it.src) ? 'on' : ''}"
                          @click=${(e) => { e.stopPropagation(); this._favorites.toggle(it.src); }}
                          @pointerdown=${(e) => e.stopPropagation()}
                          role="button"
                          title="Favorite"
                        >
                          <ha-icon icon="${this._favorites.has(it.src) ? 'mdi:star' : 'mdi:star-outline'}"></ha-icon>
                        </div>
                      </button>
                    `;
                  })}
                </div>
              `
            : noResultsForFilter
              ? html`
                  <div class="thumbs-empty-state">
                    ${this._filterFavorites
                      ? "No favorites for this day."
                      : `No ${filterLabelList(this._objectFilters)} media for this day.`}
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
            ? html`${previewBlock}${controlsFixedBlock}${showGalleryControls && !fixedMode ? html`<div class="divider"></div>` : html``}`
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
                    if (this.config?.clean_mode) this._previewOpen = false;
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

              ${useDatePicker ? html`
                <div class="datepill has-filters" role="group" aria-label="Day navigation">
                  <div class="dateinfo datepick" @click=${() => this._openDatePicker(days)} title="Select date">
                    <span class="txt">${currentForNav ? formatDay(currentForNav, this._hass?.locale) : "—"}</span>
                  </div>
                </div>
              ` : html`
                <div class="datepill" role="group" aria-label="Day navigation">
                  <button class="iconbtn" ?disabled=${!canPrev} @click=${() => this._stepDay(+1, days, currentForNav)} aria-label="Previous day" title="Previous day">
                    <ha-icon icon="mdi:chevron-left"></ha-icon>
                  </button>
                  <div class="dateinfo" title="Selected day">
                    <span class="txt">${currentForNav ? formatDay(currentForNav, this._hass?.locale) : "—"}</span>
                  </div>
                  <button class="iconbtn" ?disabled=${!canNext} @click=${() => this._stepDay(-1, days, currentForNav)} aria-label="Next day" title="Next day">
                    <ha-icon icon="mdi:chevron-right"></ha-icon>
                  </button>
                </div>
              `}

              ${showTypeFilter ? html`
                <div class="seg" style="${isLive ? "opacity:0.35;pointer-events:none" : ""}">
                  <button class="segbtn ${this._filterVideo ? "on" : ""}" @click=${() => this._toggleFilterVideo()} title="Videos" style="border-radius:10px 0 0 10px">
                    <ha-icon icon="mdi:video" style="--mdc-icon-size:16px"></ha-icon>
                  </button>
                  <button class="segbtn ${this._filterImage ? "on" : ""}" @click=${() => this._toggleFilterImage()} title="Photos" style="border-radius:0 10px 10px 0">
                    <ha-icon icon="mdi:image" style="--mdc-icon-size:16px"></ha-icon>
                  </button>
                </div>
              ` : html``}

              <div class="seg">
                <button class="segbtn ${this._filterFavorites ? "on" : ""}" @click=${() => this._toggleFilterFavorites()} title="Favorites" style="border-radius:10px">
                  <ha-icon icon="mdi:star" style="--mdc-icon-size:16px"></ha-icon>
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
            ? html`${showGalleryControls && !fixedMode ? html`<div class="divider"></div>` : html``}${previewBlock}${controlsFixedBlock}`
            : html``}
        </div>

        ${this._showBulkHint && this._selectMode
          ? html`
              <div class="bulk-floating-hint">
                Select thumbnails to delete
              </div>
            `
          : html``}

        ${this._renderDatePicker()}

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
        padding: var(--cardPad, 4px 4px);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .divider {
        display: none;
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
        color: rgba(255,255,255,0.75);
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
      }

      .live-host-hidden {
        display: none;
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
        width: calc(100% + 8px);
        box-sizing: border-box;
        margin-top: 0;
        margin-left: -4px;
        margin-right: -4px;
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
        border: 1px solid rgba(255,255,255,0.3);
        background: linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(0,0,0,0.28) 100%);
        backdrop-filter: blur(16px) saturate(180%);
        -webkit-backdrop-filter: blur(16px) saturate(180%);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.25);
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
      }
      .controls-bar-fixed .live-controls-main--fixed,
      .controls-bar-fixed .live-pills-left,
      .controls-bar-fixed .live-pills-right {
        display: contents;
      }
      .controls-bar-fixed .gallery-pill,
      .controls-bar-fixed .live-pill-btn {
        flex: 1;
        height: 28px;
        min-width: 0;
        background: var(--cgc-obj-btn-bg, var(--cgc-ui-bg));
        border-radius: var(--cgc-obj-btn-radius, 10px);
        color: var(--cgc-txt);
        padding: 0;
        font-size: var(--cgc-pill-size, 14px);
        font-weight: 600;
      }
      .controls-bar-fixed .gallery-pill::before {
        display: none;
      }
      .controls-bar-fixed .live-pill-btn.active {
        background: var(--primary-color, #2196f3);
        border-radius: var(--cgc-obj-btn-radius, 10px);
      }
      .controls-bar-fixed .live-hamburger-wrap {
        flex: 1;
        display: flex;
      }
      .controls-bar-fixed .live-hamburger-wrap > .gallery-pill {
        flex: 1;
        width: 100%;
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
        background: rgba(0,0,0,0.72);
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
        to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
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
        color: rgba(255,255,255,0.92);
        transition: background 0.15s ease, opacity 0.15s ease;
        -webkit-tap-highlight-color: transparent;
        width: 100%;
        text-align: left;
        opacity: 0.5;
      }
      .live-menu-panel-btn.active {
        opacity: 1;
      }
      .live-menu-panel-btn:hover {
        background: rgba(255,255,255,0.08);
        opacity: 1;
      }
      .panel-btn-icon {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: rgba(255,255,255,0.14);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: background 0.15s ease, color 0.15s ease;
        flex-shrink: 0;
        color: rgba(255,255,255,0.7);
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

      .live-pill-btn.mic-error {
        background: rgba(255,160,0,0.85);
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
        gap: 6px;
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

      .dp-month-header {
        padding: 8px 18px 4px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        opacity: 0.45;
        color: var(--primary-text-color);
        border-top: 1px solid var(--divider-color, rgba(255,255,255,0.08));
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
      }

      .tthumbs.horizontal {
        display: flex;
        align-items: center;
        gap: var(--tgap, 12px);
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

      .tthumbs.horizontal::-webkit-scrollbar { display: none; }

      .tthumbs.vertical {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        align-items: start;
        gap: var(--tgap, 12px);
        margin-top: 0;
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

      .fav-btn {
        position: absolute;
        bottom: 4px;
        left: 4px;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        color: rgba(255,255,255,0.5);
        --mdc-icon-size: 22px;
        --ha-icon-size: 22px;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s ease;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6));
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
  }
}

CameraGalleryCard.prototype.getCardSize = function() { return 6; };
CameraGalleryCard.prototype.getLayoutOptions = function() {
  return { grid_columns: 4, grid_min_columns: 2 };
};

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
const CGC_ICONS = {
  'mdi:close': 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
  'mdi:arrow-left': 'M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z',
  'mdi:check': 'M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z',
  'mdi:folder-outline': 'M20,18H4V8H20M20,6H12L10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6Z',
  'mdi:folder-search-outline': 'M11.5,13C12.04,13 12.55,13.17 12.97,13.46L16.43,9.1C15.55,8.44 14.82,7.62 14.27,6.67L10.5,6.5L8.5,4.5H4.5C3.4,4.5 2.5,5.4 2.5,6.5V18.5A2,2 0 0,0 4.5,20.5H15.73C15.27,19.88 15,19.1 15,18.25C15,16.18 16.68,14.5 18.75,14.5C20.82,14.5 22.5,16.18 22.5,18.25C22.5,20.32 20.82,22 18.75,22C17.6,22 16.56,21.5 15.83,20.68L12.38,17.22C12.1,17.39 11.81,17.5 11.5,17.5C10.12,17.5 9,16.38 9,15C9,13.62 10.12,12.5 11.5,12.5L11.5,13Z',
  'mdi:delete-outline': 'M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19M8,9H16V19H8V9M15.5,4L14.5,3H9.5L8.5,4H5V6H19V4H15.5Z',
  'mdi:chevron-right': 'M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z',
  'mdi:chevron-down': 'M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z',
  'mdi:information-outline': 'M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z',
  'mdi:help-circle-outline': 'M11,18H13V16H11V18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,6A4,4 0 0,0 8,10H10A2,2 0 0,1 12,8A2,2 0 0,1 14,10C14,12 11,11.75 11,15H13C13,12.75 16,12.5 16,10A4,4 0 0,0 12,6Z',
  'mdi:alert-outline': 'M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z',
  'mdi:plus': 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z',
  'mdi:backup-restore': 'M12,4C14.1,4 16.1,4.8 17.6,6.3C20.7,9.4 20.7,14.5 17.6,17.6C15.8,19.5 13.3,20.2 10.9,19.9L11.4,17.9C13.1,18.1 14.9,17.5 16.2,16.2C18.5,13.9 18.5,10.1 16.2,7.7C15.1,6.6 13.5,6 12,6V10.6L7,5.6L12,0.6V4M6.3,17.6C3.7,15 3.3,11 5.1,7.9L6.6,9.4C5.5,11.6 5.9,14.4 7.8,16.2C8.6,17 9.5,17.5 10.5,17.8L10,19.8C8.5,19.4 7.3,18.6 6.3,17.6Z',
  'mdi:cog-outline': 'M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.68 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z',
  'mdi:image-outline': 'M19,19H5V5H19M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M13.96,12.29L11.21,15.83L9.25,13.47L6.5,17H17.5L13.96,12.29Z',
  'mdi:video-outline': 'M15,8V16H5V8H15M16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5V7A1,1 0 0,0 16,6Z',
  'mdi:view-grid-outline': 'M3,3V11H11V3H3M9,9H5V5H9V9M3,13V21H11V13H3M9,19H5V15H9V19M13,3V11H21V3H13M19,9H15V5H19V9M13,13V21H21V13H13M19,19H15V15H19V19Z',
  'mdi:palette-outline': 'M12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2C17.5,2 22,6 22,11A6,6 0 0,1 16,17H14.2C13.9,17 13.7,17.2 13.7,17.5C13.7,17.6 13.8,17.7 13.8,17.8C14.2,18.3 14.4,18.9 14.4,19.5C14.5,20.9 13.4,22 12,22M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C12.3,20 12.5,19.8 12.5,19.5C12.5,19.3 12.4,19.2 12.4,19.1C12,18.6 11.8,18.1 11.8,17.5C11.8,16.1 12.9,15 14.3,15H16A4,4 0 0,0 20,11C20,7.1 16.4,4 12,4M6.5,10A1.5,1.5 0 0,0 5,11.5A1.5,1.5 0 0,0 6.5,13A1.5,1.5 0 0,0 8,11.5A1.5,1.5 0 0,0 6.5,10M9.5,6.5A1.5,1.5 0 0,0 8,8A1.5,1.5 0 0,0 9.5,9.5A1.5,1.5 0 0,0 11,8A1.5,1.5 0 0,0 9.5,6.5M14.5,6.5A1.5,1.5 0 0,0 13,8A1.5,1.5 0 0,0 14.5,9.5A1.5,1.5 0 0,0 16,8A1.5,1.5 0 0,0 14.5,6.5M17.5,10A1.5,1.5 0 0,0 16,11.5A1.5,1.5 0 0,0 17.5,13A1.5,1.5 0 0,0 19,11.5A1.5,1.5 0 0,0 17.5,10Z',
  'mdi:card-outline': 'M20,8H4V6H20M20,18H4V12H20M20,4H4C2.9,4 2,4.9 2,6V18C2,19.1 2.9,20 4,20H20C21.1,20 22,19.1 22,18V6C22,4.9 21.1,4 20,4Z',
  'mdi:filter-outline': 'M15,19.88C15.04,20.18 14.94,20.5 14.71,20.71C14.32,21.1 13.69,21.1 13.3,20.71L9.29,16.7C9.06,16.47 8.96,16.16 9,15.87V10.75L4.21,4.62C3.87,4.19 3.95,3.56 4.38,3.22C4.57,3.08 4.78,3 5,3V3H19V3C19.22,3 19.43,3.08 19.62,3.22C20.05,3.56 20.13,4.19 19.79,4.62L15,10.75V19.88M7.04,5L11,10.06V15.58L13,17.58V10.05L16.96,5H7.04Z',
  'mdi:calendar-outline': 'M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,13H12V18H17V13Z',
  'mdi:account': 'M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z',
  'mdi:car': 'M18.92,6C18.72,5.42 18.16,5 17.5,5H6.5C5.84,5 5.28,5.42 5.08,6L3,12V20A1,1 0 0,0 4,21H5A1,1 0 0,0 6,20V19H18V20A1,1 0 0,0 19,21H20A1,1 0 0,0 21,20V12L18.92,6M6.5,16A1.5,1.5 0 0,1 5,14.5A1.5,1.5 0 0,1 6.5,13A1.5,1.5 0 0,1 8,14.5A1.5,1.5 0 0,1 6.5,16M17.5,16A1.5,1.5 0 0,1 16,14.5A1.5,1.5 0 0,1 17.5,13A1.5,1.5 0 0,1 19,14.5A1.5,1.5 0 0,1 17.5,16M5,11L6.5,6.5H17.5L19,11H5Z',
  'mdi:bicycle': 'M5,20.5A3.5,3.5 0 0,1 1.5,17A3.5,3.5 0 0,1 5,13.5A3.5,3.5 0 0,1 8.5,17A3.5,3.5 0 0,1 5,20.5M5,12A5,5 0 0,0 0,17A5,5 0 0,0 5,22A5,5 0 0,0 10,17A5,5 0 0,0 5,12M14.8,10H19V8.2H15.8L13.86,4.93C13.57,4.43 13,4.1 12.4,4.1C11.93,4.1 11.5,4.29 11.2,4.6L7.5,8.29C7.19,8.6 7,9 7,9.5C7,10.13 7.33,10.66 7.85,10.97L11.2,13V18H13V11.5L10.75,10.15L13.07,7.85M19,20.5A3.5,3.5 0 0,1 15.5,17A3.5,3.5 0 0,1 19,13.5A3.5,3.5 0 0,1 22.5,17A3.5,3.5 0 0,1 19,20.5M19,12A5,5 0 0,0 14,17A5,5 0 0,0 19,22A5,5 0 0,0 24,17A5,5 0 0,0 19,12M16,4.8C17,4.8 17.8,4 17.8,3C17.8,2 17,1.2 16,1.2C15,1.2 14.2,2 14.2,3C14.2,4 15,4.8 16,4.8Z',
  'mdi:bird': 'M12.07,2.29C12.07,2.29 6,2 6,8C6,8 5.54,9.69 7,10.5V11.5L5,13L6,14L8,13.5V14.5L6,16V17L8,17.5V22H9V17.5L11.92,16.18V22H13V16L15,17V22H16V16.5L16.5,16V11C16.5,11 18.5,10.5 18.5,8C18.5,5.5 16.72,4.29 16,4C15,3.5 14.5,3 12.07,2.29M12,4C12,4 14,4 15,5C15,5 13,5 12,4Z',
  'mdi:bus': 'M18,11H6V6H18M16.5,17A1.5,1.5 0 0,1 15,15.5A1.5,1.5 0 0,1 16.5,14A1.5,1.5 0 0,1 18,15.5A1.5,1.5 0 0,1 16.5,17M7.5,17A1.5,1.5 0 0,1 6,15.5A1.5,1.5 0 0,1 7.5,14A1.5,1.5 0 0,1 9,15.5A1.5,1.5 0 0,1 7.5,17M4,16C4,16.88 4.39,17.67 5,18.22V20A1,1 0 0,0 6,21H7A1,1 0 0,0 8,20V19H16V20A1,1 0 0,0 17,21H18A1,1 0 0,0 19,20V18.22C19.61,17.67 20,16.88 20,16V6C20,2.5 16.42,2 12,2C7.58,2 4,2.5 4,6V16Z',
  'mdi:cat': 'M12,8L10.67,8.09C9.81,7.07 7.4,4.5 5,4.5C5,4.5 3.03,7.46 4.96,9.75C4.87,10.5 4.84,11.25 4.84,12C4.84,17.05 7.88,20 12,20C16.12,20 19.16,17.05 19.16,12C19.16,11.25 19.13,10.5 19.04,9.75C20.97,7.46 19,4.5 19,4.5C16.6,4.5 14.19,7.07 13.33,8.09L12,8M9,11A1,1 0 0,1 10,12A1,1 0 0,1 9,13A1,1 0 0,1 8,12A1,1 0 0,1 9,11M15,11A1,1 0 0,1 16,12A1,1 0 0,1 15,13A1,1 0 0,1 14,12A1,1 0 0,1 15,11M11,14H13L12.3,15.39C12.5,16.03 13.06,16.5 13.75,16.5A1.25,1.25 0 0,0 15,15.25V15H16V15.25A2.25,2.25 0 0,1 13.75,17.5C13,17.5 12.35,17.15 11.92,16.6L11,14Z',
  'mdi:dog': 'M4.5,9.5A0.5,0.5 0 0,1 4,9A0.5,0.5 0 0,1 4.5,8.5A0.5,0.5 0 0,1 5,9A0.5,0.5 0 0,1 4.5,9.5M6,3C4.89,3 4,3.89 4,5V9.5A2.5,2.5 0 0,0 6.5,12A2.5,2.5 0 0,0 9,9.5V5A2,2 0 0,1 11,3H6M18.5,9.5A0.5,0.5 0 0,1 18,9A0.5,0.5 0 0,1 18.5,8.5A0.5,0.5 0 0,1 19,9A0.5,0.5 0 0,1 18.5,9.5M18,3H14C15.1,3 16,3.89 16,5V9.5A2.5,2.5 0 0,1 13.5,12A2.5,2.5 0 0,1 11,9.5V9H9V9.5A2.5,2.5 0 0,1 6.5,12H6.5A2.5,2.5 0 0,1 5.42,11.79L3,14.21V21H9V16.72C9.75,17.24 10.84,17.5 12,17.5C13.16,17.5 14.25,17.24 15,16.72V21H21V14.21L18.58,11.79A2.5,2.5 0 0,1 17.5,12A2.5,2.5 0 0,1 15,9.5V5A2,2 0 0,1 17,3H18C19.1,3 20,3.89 20,5V9C20,9 20.07,9.27 20.35,9.41L21,9.69V5C21,3.89 20.1,3 19,3H18Z',
  'mdi:motorbike': 'M5,11.5A0.5,0.5 0 0,1 5.5,12A0.5,0.5 0 0,1 5,12.5A0.5,0.5 0 0,1 4.5,12A0.5,0.5 0 0,1 5,11.5M19,11.5A0.5,0.5 0 0,1 19.5,12A0.5,0.5 0 0,1 19,12.5A0.5,0.5 0 0,1 18.5,12A0.5,0.5 0 0,1 19,11.5M19,9.5A2.5,2.5 0 0,0 16.5,12A2.5,2.5 0 0,0 19,14.5A2.5,2.5 0 0,0 21.5,12A2.5,2.5 0 0,0 19,9.5M5,9.5A2.5,2.5 0 0,0 2.5,12A2.5,2.5 0 0,0 5,14.5A2.5,2.5 0 0,0 7.5,12A2.5,2.5 0 0,0 5,9.5M19,8C20.61,8 22,8.88 22.73,10.19L21.31,10.89C20.83,10.35 20.16,10 19.39,10L19,10C19,10 18,8 17,8L14,8L11.78,8.7L13.04,10H15.54L13.81,12.72L12.08,10.55L10.3,10L9.63,8.12C9.12,7.47 8.36,7 7.5,7C6,7 4.77,8.06 4.55,9.5H3.03C3.27,7.24 5.17,5.5 7.5,5.5C9.21,5.5 10.67,6.5 11.37,8H13L10,5H17C18.1,5 19,5.9 19,7V8M5,8C3.39,8 2,8.88 1.27,10.19L2.69,10.89C3.17,10.35 3.84,10 4.61,10L5,10C5,10 6,8 7,8H5Z',
  'mdi:truck': 'M18,18.5A1.5,1.5 0 0,1 16.5,17A1.5,1.5 0 0,1 18,15.5A1.5,1.5 0 0,1 19.5,17A1.5,1.5 0 0,1 18,18.5M19.5,9.5L21.46,12H17V9.5M6.5,18.5A1.5,1.5 0 0,1 5,17A1.5,1.5 0 0,1 6.5,15.5A1.5,1.5 0 0,1 8,17A1.5,1.5 0 0,1 6.5,18.5M20,8H17V4H3C1.89,4 1,4.89 1,6V17H3A3,3 0 0,0 6,20A3,3 0 0,0 9,17H15A3,3 0 0,0 18,20A3,3 0 0,0 21,17H23V12L20,8Z',
  'mdi:doorbell-video': 'M6,2A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V4A2,2 0 0,0 18,2H6M12,5A3,3 0 0,1 15,8A3,3 0 0,1 12,11A3,3 0 0,1 9,8A3,3 0 0,1 12,5M7,14H9V19H7V14M9,14H15V19H9V14M15,14H17V19H15V14Z',
  'mdi:shape': 'M11,13.5V21.5H3V13.5H11M12,2L17.5,11H6.5L12,2M17.5,13C20,13 22,15 22,17.5C22,20 20,22 17.5,22C15,22 13,20 13,17.5C13,15 15,13 17.5,13Z',
};

function svgIcon(icon, size = 18) {
  const path = CGC_ICONS[icon] || '';
  return `<svg class="cgc-svg-icon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" style="fill:currentColor;flex-shrink:0;display:block"><path d="${path}"/></svg>`;
}

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
      { type: "slider", id: "barop", valId: "barval", configKey: "bar_opacity", label: "Opacity", min: 0, max: 100, default: 45, unit: "%" },
      { type: "select", configKey: "bar_position", label: "Position", disabledFn: (c) => c.controls_mode === "fixed", options: [{ value: "top", label: "Top" }, { value: "bottom", label: "Bottom" }, { value: "hidden", label: "Hidden" }] },
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
      const safeId = variable.replace(/[^a-z0-9]/gi, "-");
      const display = this.shadowRoot.getElementById("radius-val-" + safeId);

      slider.addEventListener("input", (e) => {
        if (display) display.textContent = e.target.value + "px";
      }, sig);

      slider.addEventListener("change", (e) => {
        this._setStyleVariable(variable, e.target.value + "px");
        this._fire();
        this._scheduleRender();
      }, sig);
    });

    this.shadowRoot.querySelectorAll("[data-seg-key]").forEach((el) => {
      el.addEventListener("change", (e) => {
        this._set(el.dataset.segKey, e.target.value);
      }, sig);
    });

    this.shadowRoot.querySelectorAll("[data-config-slider]").forEach((slider) => {
      const key = slider.dataset.configSlider;
      const unit = slider.dataset.sliderUnit || "";
      const defaultVal = Number(slider.dataset.sliderDefault);
      const display = this.shadowRoot.getElementById(slider.dataset.sliderValId);

      slider.addEventListener("input", (e) => {
        if (display) display.textContent = e.target.value + unit;
      }, sig);

      slider.addEventListener("change", (e) => {
        const v = Number(e.target.value);
        if (display) display.textContent = v + unit;
        this._set(key, Number.isFinite(v) ? v : defaultVal);
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
        ${svgIcon(icon, 16)}
        <span>${label}</span>
      </button>
    `;

    const panelHead = (icon, title, subtitle) => `
      <div class="panelhead">
        <div class="panelicon">
          ${svgIcon(icon, 20)}
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
                <div class="lbl">Source</div>
                <div class="segwrap">
                  <button class="seg ${sensorModeOn ? "on" : ""}" data-src="sensor">File sensor</button>
                  <button class="seg ${mediaModeOn ? "on" : ""}" data-src="media">Media folders</button>
                  <button class="seg ${combinedModeOn ? "on" : ""}" data-src="combined">Combined</button>
                </div>

                ${sensorModeOn ? `
                <div style="margin-top:10px;">
                  <div class="field" id="entities-field">
                    <textarea id="entities" rows="4" placeholder="Enter one sensor per line"></textarea>
                    <div class="suggestions" id="entities-suggestions" hidden></div>
                  </div>
                  ${invalidEntities.length ? `<div class="desc">⚠️ Invalid / missing sensor(s): <code>${invalidEntities.join("</code>, <code>")}</code></div>` : ``}
                  ${this._renderFilesWizard()}
                </div>
                ` : mediaModeOn ? `
                <div style="margin-top:10px;">
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
                <div style="margin-top:10px;">
                  <div class="lbl" style="margin-bottom:6px;">File sensor(s)</div>
                  <div class="field" id="entities-field">
                    <textarea id="entities" rows="3" placeholder="Enter one sensor per line"></textarea>
                    <div class="suggestions" id="entities-suggestions" hidden></div>
                  </div>
                  ${invalidEntities.length ? `<div class="desc">⚠️ Invalid / missing sensor(s): <code>${invalidEntities.join("</code>, <code>")}</code></div>` : ``}
                  <div class="lbl" style="margin-top:12px;margin-bottom:6px;">Media folder(s)</div>
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
              ${(mediaModeOn || combinedModeOn) ? `
              <div class="row" style="margin-top:4px;">
                <div class="lbl">Frigate URL (optional)</div>
                <div class="desc">Direct Frigate API URL (e.g. <code>http://192.168.1.x:5000</code>). If set, clips load instantly via Frigate REST API instead of the media-source walk.</div>
                <div class="field">
                  <input type="text" class="ed-input" id="frigate_url" placeholder="http://192.168.1.x:5000" autocomplete="off" value="${this._config.frigate_url || ""}" />
                </div>
              </div>
              ` : ``}
              </div>

              <div class="row">
                <div class="lbl">Datetime formats</div>
                <div class="desc">
                  ${svgIcon('mdi:information-outline', 14)}
                  Configure at least one format so files can be grouped by date. Files with no matching format appear under <strong>Other</strong>.
                  Tokens: <code>YYYY</code> <code>MM</code> <code>DD</code> <code>HH</code> <code>mm</code> <code>ss</code>
                </div>
                <div style="padding-top:8px;display:flex;flex-direction:column;gap:14px;">
                  <div>
                    <div class="lbl">Folder datetime format</div>
                    <input type="text" class="ed-input" id="folderfmt" placeholder="e.g. YYYY-MM-DD" style="margin-top:4px;" />
                    <div class="hint" style="margin-top:4px;">
                      ${svgIcon('mdi:information-outline', 14)}
                      Matches the folder name in the path. Examples: <code>YYYY-MM-DD</code>, <code>YYYYMMDD</code>, <code>DD-MM-YYYY</code>. Year defaults to current year if omitted.
                    </div>
                  </div>
                  <div>
                    <div class="lbl">Filename datetime format</div>
                    <input type="text" class="ed-input" id="filenamefmt" placeholder="e.g. YYYYMMDD_HHmmss" style="margin-top:4px;" />
                    <div class="hint" style="margin-top:4px;">
                      ${svgIcon('mdi:information-outline', 14)}
                      Matches the filename (without extension). Examples: <code>YYYYMMDD_HHmmss</code>, <code>DD-MM-YYYY_HH-mm-ss</code>, <code>YYYY-MM-DDTHH:mm:ss</code>
                    </div>
                  </div>
                </div>
              </div>

              <div class="row ${mediaModeOn ? "row-disabled" : ""}">
                <div class="lbl">Delete service</div>
                <div class="hint">
                  ${mediaModeOn ? `
                    ${svgIcon('mdi:information-outline', 14)}
                    <span>Delete is not available in <strong>Media folders</strong> mode. Media-source items don't map to filesystem paths the shell command can delete — switch the source above to enable.</span>
                  ` : `
                    ${svgIcon('mdi:help-circle-outline', 14)}
                    <a
                      href="https://github.com/TheScubadiver/camera-gallery-card?tab=readme-ov-file#delete-setup"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      How to configure the shell command
                    </a>
                  `}
                </div>

                <div class="selectwrap">
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
                    <div class="lbl">Clean mode</div>
                  </div>

                  <div class="togrow">
                    <label class="cgc-switch"><input type="checkbox" id="cleanmode" ${cleanMode ? "checked" : ""}><span class="cgc-track"></span></label>
                  </div>
                </div>
              </div>

              <div class="row">
                <div class="lbl">Controls position</div>
                <div class="segwrap">
                  <button class="seg ${(c.controls_mode ?? "overlay") === "overlay" ? "on" : ""}" data-ctrlmode="overlay">Overlay</button>
                  <button class="seg ${c.controls_mode === "fixed" ? "on" : ""}" data-ctrlmode="fixed">Fixed</button>
                </div>
              </div>

              <div class="row">
                <div class="row-head">
                  <div>
                    <div class="lbl">Show camera name</div>
                  </div>
                  <div class="togrow">
                    <label class="cgc-switch"><input type="checkbox" id="showcameratitle" ${c.show_camera_title !== false ? "checked" : ""} ${c.controls_mode === "fixed" ? "disabled" : ""}><span class="cgc-track"></span></label>
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
                    <label class="cgc-switch"><input type="checkbox" id="persistentcontrols" ${persistentControls ? "checked" : ""}><span class="cgc-track"></span></label>
                  </div>
                </div>
              </div>

              <div class="row">
                <div class="subrows">
                  <div class="row-head">
                    <div class="lbl">Autoplay</div>
                    <div class="togrow">
                      <label class="cgc-switch"><input type="checkbox" id="autoplay"><span class="cgc-track"></span></label>
                    </div>
                  </div>

                  <div class="row-head">
                    <div class="lbl">Auto muted</div>
                    <div class="togrow">
                      <label class="cgc-switch"><input type="checkbox" id="auto_muted"><span class="cgc-track"></span></label>
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
                    <label class="cgc-switch"><input type="checkbox" id="liveenabled" ${liveEnabled ? "checked" : ""} ${liveControlsDisabled ? "disabled" : ""}><span class="cgc-track"></span></label>
                  </div>
                </div>

              </div>

              ${
                liveEnabled
                  ? `
                ${cameraEntities.length > 1 ? `
                <div class="row">
                  <div class="lbl">Visible cameras in picker</div>
                  <div class="desc">Select cameras for the picker. At least one camera must be added to enable live mode.</div>
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
                  ${liveCameraEntity ? `
                  <div class="livecam-tags">
                    <div class="livecam-tag"><span>${liveCameraEntity.startsWith("__cgc_stream") ? (this._getStreamEntryById(liveCameraEntity)?.name || "Stream") : String(this._hass?.states?.[liveCameraEntity]?.attributes?.friendly_name || liveCameraEntity).trim()}</span><span class="livecam-tag-entity">${liveCameraEntity.startsWith("__cgc_stream") ? "stream url" : liveCameraEntity}</span><button type="button" class="livecam-tag-del" data-deldefcam="${liveCameraEntity}">×</button></div>
                  </div>
                  ${liveCameraEntity !== "__cgc_stream__" && liveCameraEntities.length > 0 && !liveCameraEntities.includes(liveCameraEntity) ? `
                  <div class="cgc-inline-warn">${svgIcon('mdi:alert-outline', 14)}<span>This camera is not in the visible cameras list. It will not appear in the picker.</span></div>
                  ` : ``}
                  ` : ``}
                  ${!liveControlsDisabled ? `
                  <div class="field" style="margin-top:6px;">
                    <input type="text" class="ed-input" id="livedefault-input" placeholder="Search cameras..." autocomplete="off" ${liveCameraEntity ? `style="display:none;"` : ``} />
                    <div class="suggestions" id="livedefault-suggestions" hidden></div>
                  </div>
                  ` : ``}
                </div>

                <div class="row">
                  <div class="lbl">Stream URLs</div>
                  <div class="desc">Optional. Add one or more RTSP/HLS/RTMP stream URLs. Each gets its own entry in the camera picker.</div>
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


                <div class="row">
                  <div class="row-head">
                    <div class="lbl">Auto muted</div>
                    <div class="togrow">
                      <label class="cgc-switch"><input type="checkbox" id="live_auto_muted"><span class="cgc-track"></span></label>
                    </div>
                  </div>
                </div>

                <div class="row">
                  <div class="lbl">Menu buttons</div>
                  <div class="desc">Buttons shown in the hamburger menu during live view.</div>
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
                                <div class="field">
                                  <input type="text" class="ed-input" data-menubtn="${i}" data-mbfield="icon" value="${(btn.icon||"").replace(/"/g,"&quot;")}" placeholder="mdi:lightbulb" autocomplete="off" />
                                  <div class="suggestions" data-menubtn-icon-sugg="${i}" hidden></div>
                                </div>
                              </div>
                              <div>
                                <div style="font-size:0.75em;opacity:0.6;margin-bottom:2px;">Icon (on)</div>
                                <div class="field">
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
                        <div class="field">
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
              `
                  : ``
              }

            </div>
          `;

      if (this._activeTab === "thumbs") return `
            <div class="tabpanel" data-panel="thumbs">
              <div class="row">
                <div class="lbl">Thumbnail layout</div>
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
                <div class="ed-input-row"><input type="number" class="ed-input" id="maxmedia" /><span class="ed-suffix">items</span></div>
              </div>

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
                <div class="lbl">Thumbnail bar position</div>
                <div class="segwrap">
                  <button class="seg ${thumbBarPos === "top" ? "on" : ""}" data-tbpos="top">Top</button>
                  <button class="seg ${thumbBarPos === "bottom" ? "on" : ""}" data-tbpos="bottom">Bottom</button>
                  <button class="seg ${thumbBarPos === "hidden" ? "on" : ""}" data-tbpos="hidden">Hidden</button>
                </div>
              </div>

              <div class="row">
                <div class="lbl">Object filters</div>
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

              <div class="row">
                <div class="lbl">Custom Object Filters</div>

                  <div class="custom-filter-add">
                    <input type="text" class="ed-input" id="new-filter-name" placeholder="e.g. parcel" />
                    <input type="text" class="ed-input" id="new-filter-icon" placeholder="mdi:shape" />
                    <button class="actionbtn" id="add-filter-btn">
                      ${svgIcon('mdi:plus', 18)}
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
                            ${svgIcon('mdi:delete-outline', 18)}
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
                                      min="${ctrl.min}"
                                      max="${ctrl.max}"
                                      value="${val}"
                                    >
                                    <span class="radius-value" id="radius-val-${safeId}">${val}px</span>
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
                                      id="${ctrl.id}"
                                      min="${ctrl.min}"
                                      max="${ctrl.max}"
                                      value="${val}"
                                    >
                                    <span class="radius-value" id="${ctrl.valId}">${val}${ctrl.unit}</span>
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
          scrollbar-width: none;
        }
        :host::-webkit-scrollbar { display: none; }

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

        .tabbtn .cgc-svg-icon {
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
          box-sizing: border-box;
          scrollbar-width: none;
        }
        .tabpanel::-webkit-scrollbar { display: none; }
        .wrap { scrollbar-width: none; }
        .wrap::-webkit-scrollbar { display: none; }

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

        .panelicon .cgc-svg-icon {
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
        .livecam-tag.dnd-dragging { opacity: 0.35; }
        .livecam-tag.dnd-over { box-shadow: -3px 0 0 0 var(--primary-color, #03a9f4); }
        .livecam-tag-grip {
          font-size: 18px; opacity: 0.4; line-height: 1;
          cursor: grab; user-select: none;
          padding: 4px 4px 4px 2px; margin: -4px 0;
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
details summary { user-select: none; }
        details summary .details-chevron { transition: transform 0.15s; margin-left: auto; }
        details[open] summary .details-chevron { transform: rotate(90deg); }
        .cgc-row-summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 6px; padding: 0; }
        .cgc-row-summary::-webkit-details-marker { display: none; }
        .cgc-row-body { padding-top: 8px; }
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
if (oldPanel && tmp.firstElementChild) {
        oldPanel.replaceWith(tmp.firstElementChild);
      } else if (!oldPanel && tmp.firstElementChild) {
        this.shadowRoot.querySelector(".tabbar")?.insertAdjacentElement("afterend", tmp.firstElementChild);
      }

      // Update media browser slot
      const browserSlot = this.shadowRoot.getElementById("cgc-browser-slot");
      if (browserSlot) browserSlot.innerHTML = mediaBrowserHtml;
    }

    if (this._evtCtrl) this._evtCtrl.abort();
    this._evtCtrl = new AbortController();
    const _sig = { signal: this._evtCtrl.signal };

    this._initCollapsibleRows(_sig);

    const $ = (id) => this.shadowRoot.getElementById(id);

        // 1. Zoek de elementen op
        const addBtn = $("add-filter-btn");
        const nameInput = $("new-filter-name");
        const iconInput = $("new-filter-icon");
        // (native input, geen hass nodig)

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
        addBtn?.addEventListener("click", handleAddFilter, _sig);

        // 4. Enter op naam-veld voegt toe
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
      input.addEventListener("click", (e) => e.stopPropagation(), _sig);
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
    const thumbpctEl = $("thumbpct");
    const thumbpctvalEl = $("thumbpctval");

    const autoplayEl = $("autoplay");
    const autoMutedEl = $("auto_muted");
    const liveAutoMutedEl = $("live_auto_muted");

    this._setControlValue(entitiesEl, entitiesText);
    this._setControlValue(mediaEl, mediaSourcesText);
    this._setControlValue(filenameFmtEl, filenameDatetimeFormat);
    this._setControlValue(folderFmtEl, folderDatetimeFormat);
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

    delserviceEl?.addEventListener("change", commitDeleteService, _sig);

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

    filenameFmtEl?.addEventListener("input", () => commitFilenameFormat(false), _sig);
    filenameFmtEl?.addEventListener("change", () => commitFilenameFormat(true), _sig);
    filenameFmtEl?.addEventListener("blur", () => commitFilenameFormat(true), _sig);

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

    folderFmtEl?.addEventListener("input", () => commitFolderFormat(false), _sig);
    folderFmtEl?.addEventListener("change", () => commitFolderFormat(true), _sig);
    folderFmtEl?.addEventListener("blur", () => commitFolderFormat(true), _sig);

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


    $("cleanmode")?.addEventListener("change", (e) => {
      this._set("clean_mode", !!e.target.checked);
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
      this._set("show_camera_title", !!e.target.checked);
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
      this._config = this._stripAlwaysTrueKeys(next);
      this._fire();
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

    $("live_go2rtc_stream")?.addEventListener("change", (e) => {
      const val = String(e.target.value || "").trim();
      if (val) this._set("live_go2rtc_stream", val);
      else { const n = { ...this._config }; delete n.live_go2rtc_stream; this._config = this._stripAlwaysTrueKeys(n); this._fire(); }
    });

    $("live_go2rtc_url")?.addEventListener("change", (e) => {
      const val = String(e.target.value || "").trim();
      if (val) this._set("live_go2rtc_url", val);
      else { const n = { ...this._config }; delete n.live_go2rtc_url; this._config = this._stripAlwaysTrueKeys(n); this._fire(); }
    });

    $("frigate_url")?.addEventListener("change", (e) => {
      const val = String(e.target.value || "").trim().replace(/\/+$/, "");
      if (val) this._set("frigate_url", val);
      else { const n = { ...this._config }; delete n.frigate_url; this._config = this._stripAlwaysTrueKeys(n); this._fire(); }
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
          ${items.map(({ id, label, sub }) => {
            return `<button type="button" class="sugg-item" data-setdefcam="${id}">${label}<span style="opacity:0.45;font-weight:500;margin-left:6px;">${sub}</span></button>`;
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
        const rawStreams = (() => {
          if (Array.isArray(this._config.live_stream_urls) && this._config.live_stream_urls.length > 0)
            return this._config.live_stream_urls.filter(e => e?.url);
          if (this._config.live_stream_url)
            return [{ url: this._config.live_stream_url, name: this._config.live_stream_name || "Stream" }];
          return [];
        })();
        const streamEntries = rawStreams.map((e, i) => ({ id: `__cgc_stream_${i}__`, label: e.name || `Stream ${i + 1}`, sub: "stream url" }));
        const entityEntries = cameraEntities.map((id) => ({
          id,
          label: String(this._hass?.states?.[id]?.attributes?.friendly_name || id).trim(),
          sub: id,
        }));
        return [...streamEntries, ...entityEntries].filter(({ label, sub }) => {
          if (!q) return true;
          return label.toLowerCase().includes(q) || sub.toLowerCase().includes(q);
        });
      };

      livedefaultInput.addEventListener("focus", () => renderDefSuggestions(getDefSuggestions()), _sig);
      livedefaultInput.addEventListener("input", () => renderDefSuggestions(getDefSuggestions()), _sig);
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

    // Icon autocomplete helpers
    const COMMON_ICONS = ["mdi:lightbulb","mdi:lightbulb-outline","mdi:lightbulb-off","mdi:lightbulb-on","mdi:lamp","mdi:ceiling-light","mdi:floor-lamp","mdi:led-strip","mdi:string-lights","mdi:lock","mdi:lock-open","mdi:lock-outline","mdi:lock-open-outline","mdi:lock-smart","mdi:shield-home","mdi:shield","mdi:door-open","mdi:door-closed","mdi:window-open","mdi:window-closed","mdi:garage","mdi:garage-open","mdi:gate","mdi:gate-open","mdi:thermostat","mdi:thermometer","mdi:fan","mdi:fan-off","mdi:air-conditioner","mdi:radiator","mdi:snowflake","mdi:heat-wave","mdi:home","mdi:home-outline","mdi:home-away","mdi:sleep","mdi:run","mdi:power","mdi:power-off","mdi:toggle-switch","mdi:toggle-switch-off","mdi:electric-switch","mdi:outlet","mdi:television","mdi:television-off","mdi:play","mdi:pause","mdi:stop","mdi:volume-high","mdi:volume-off","mdi:music","mdi:speaker","mdi:camera","mdi:cctv","mdi:motion-sensor","mdi:motion-sensor-off","mdi:smoke-detector","mdi:bell","mdi:bell-off","mdi:alert","mdi:robot-vacuum","mdi:washing-machine","mdi:dishwasher","mdi:coffee","mdi:car","mdi:car-connected","mdi:ev-station","mdi:water","mdi:water-off","mdi:pool","mdi:sprinkler","mdi:blinds","mdi:blinds-open","mdi:curtains","mdi:curtains-closed","mdi:ceiling-fan","mdi:ceiling-fan-light","mdi:battery","mdi:battery-charging","mdi:wifi","mdi:bluetooth","mdi:account","mdi:account-outline","mdi:account-group","mdi:star","mdi:heart","mdi:check","mdi:close","mdi:plus","mdi:minus","mdi:pencil","mdi:delete","mdi:refresh","mdi:eye","mdi:eye-off","mdi:flash","mdi:flash-off","mdi:weather-sunny","mdi:weather-night","mdi:weather-cloudy","mdi:chart-line","mdi:information","mdi:cog","mdi:tools"];

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
          btn.addEventListener("mousedown", (e) => { e.preventDefault(); onSelect(btn.dataset.pickIcon); }, _sig);
        });
      };
      input.addEventListener("focus", () => renderIconSugg(getSuggestions(input.value)), _sig);
      input.addEventListener("input", () => renderIconSugg(getSuggestions(input.value)), _sig);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); const first = sugg.querySelector("[data-pick-icon]"); if (first) onSelect(first.dataset.pickIcon); }
        else if (e.key === "Escape") { sugg.hidden = true; }
      });
      input.addEventListener("blur", () => { setTimeout(() => { sugg.hidden = true; }, 150); }, _sig);
    };

    // Menu button verwijderen
    this.shadowRoot.querySelectorAll("[data-delmenubutton]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.delmenubutton);
        const current = Array.isArray(this._config.menu_buttons) ? [...this._config.menu_buttons] : [];
        current.splice(i, 1);
        this._set("menu_buttons", current);
        this._scheduleRender();
      });
    });

    // Menu button veld inline bewerken (entity autocomplete + icon/title/service/state_on)
    const allEntityIds = Object.keys(this._hass?.states || {}).sort();
    const entitySuggestions = (q) => {
      const lq = q.toLowerCase();
      return allEntityIds.filter((id) => {
        const name = String(this._hass?.states?.[id]?.attributes?.friendly_name || "").toLowerCase();
        return !lq || id.includes(lq) || name.includes(lq);
      }).slice(0, 30);
    };

    const wireEntityInput = (input, sugg, onSelect) => {
      if (!input || !sugg) return;
      const render = (ids) => {
        if (!ids.length) { sugg.hidden = true; sugg.innerHTML = ""; return; }
        sugg.hidden = false;
        sugg.innerHTML = ids.map((id) => {
          const name = String(this._hass?.states?.[id]?.attributes?.friendly_name || id).trim();
          return `<button type="button" class="sugg-item" data-pick-entity="${id}">${name}<span style="opacity:0.45;font-weight:500;margin-left:6px;">${id}</span></button>`;
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
      wireEntityInput(input, sugg, (id) => {
        input.value = id;
        sugg.hidden = true;
        const current = Array.isArray(this._config.menu_buttons) ? [...this._config.menu_buttons] : [];
        if (!current[i]) return;
        current[i] = { ...current[i], entity: id };
        this._set("menu_buttons", current);
      });
    });

    // Menu button icon autocomplete (per bestaande knop)
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

    // Menu button veld inline bewerken (title, service, state_on)
    this.shadowRoot.querySelectorAll("input[data-menubtn][data-mbfield]").forEach((input) => {
      if (input.dataset.mbfield === "icon" || input.dataset.mbfield === "icon_on") return;
      input.addEventListener("change", () => {
        const i = Number(input.dataset.menubtn);
        const field = input.dataset.mbfield;
        const current = Array.isArray(this._config.menu_buttons) ? [...this._config.menu_buttons] : [];
        if (!current[i]) return;
        const updated = { ...current[i] };
        const val = input.value.trim();
        if (val) updated[field] = val;
        else delete updated[field];
        current[i] = updated;
        this._set("menu_buttons", current);
      });
    });

    // Menu button toevoegen
    const menubtnEntityInput = $("menubtn-entity-input");
    const menubtnEntitySugg = $("menubtn-entity-sugg");
    const menubtnIconInput = $("menubtn-icon-input");
    const menubtnAddBtn = $("menubtn-add-btn");

    wireEntityInput(menubtnEntityInput, menubtnEntitySugg, (id) => {
      if (menubtnEntityInput) menubtnEntityInput.value = id;
      if (menubtnEntitySugg) menubtnEntitySugg.hidden = true;
    });

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
        chip.addEventListener("dragleave", () => chip.classList.remove("dnd-over"), _sig);
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

  _initCollapsibleRows(sig = {}) {
    const sr = this.shadowRoot;
    if (!sr) return;
    const tab = this._activeTab || 'general';
    const PREF = 'cgc_ed_sec_';

    const getKey = (label) =>
      PREF + tab + '_' + label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    const readState = (key) => {
      try { const v = localStorage.getItem(key); return v === null ? true : v !== 'false'; }
      catch (_) { return true; }
    };

    const saveState = (key, open) => {
      try { localStorage.setItem(key, open ? 'true' : 'false'); } catch (_) {}
    };

    // Collapsible `.row` elements that have a direct `.lbl` child
    sr.querySelectorAll('.tabpanel .row').forEach(row => {
      if (row.dataset.cgcCol) return; // already processed
      row.dataset.cgcCol = '1';

      // Skip rows whose only child is .row-head (simple toggle rows — already just one line)
      const kids = Array.from(row.children);
      if (kids.length === 1 && kids[0].classList.contains('row-head')) return;

      // Must have a direct .lbl to use as heading
      const lbl = row.querySelector(':scope > .lbl');
      if (!lbl) return;

      const title = lbl.textContent.trim();
      if (!title) return;
      const key = getKey(title);
      const open = readState(key);

      const details = document.createElement('details');
      details.className = 'cgc-row-details';
      if (open) details.setAttribute('open', '');

      const summary = document.createElement('summary');
      summary.className = 'cgc-row-summary';
      const chevron = document.createElement('span');
      chevron.className = 'details-chevron';
      chevron.innerHTML = svgIcon('mdi:chevron-right', 16);
      const lblSpan = document.createElement('span');
      lblSpan.className = 'lbl';
      lblSpan.style.margin = '0';
      lblSpan.textContent = title;
      summary.appendChild(lblSpan);
      summary.appendChild(chevron);

      const body = document.createElement('div');
      body.className = 'cgc-row-body';
      [...row.childNodes].forEach(child => { if (child !== lbl) body.appendChild(child); });
      lbl.remove();

      details.appendChild(summary);
      details.appendChild(body);
      row.appendChild(details);

      details.addEventListener('toggle', () => saveState(key, details.open), sig);
    });

    // Add localStorage persistence to pre-existing <details> (Datetime formats, Styling sections)
    sr.querySelectorAll('details:not(.cgc-row-details)').forEach(details => {
      if (details.dataset.cgcCol) return;
      details.dataset.cgcCol = '1';
      const summaryText = details.querySelector('summary span, summary .lbl')?.textContent?.trim()
        || details.querySelector('summary')?.textContent?.trim() || '';
      if (!summaryText) return;
      const key = getKey(summaryText);
      try {
        const stored = localStorage.getItem(key);
        if (stored === 'false') details.removeAttribute('open');
        else if (stored === 'true') details.setAttribute('open', '');
      } catch (_) {}
      details.addEventListener('toggle', () => saveState(key, details.open), sig);
    });
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
    const RENDERS_REQUIRED = new Set(["source_mode", "live_enabled", "live_camera_entities", "object_filters", "delete_service", "live_camera_entity", "menu_buttons", "frigate_url"]);
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

    if (this._mediaBrowserOpen) return;

    const ae = this.shadowRoot?.activeElement;
    const tag = String(ae?.tagName || "").toLowerCase();
    const id = String(ae?.id || "");

    const interacting = !!(
      ae &&
      (tag === "input" ||
        tag === "textarea" ||
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