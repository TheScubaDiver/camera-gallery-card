/**
 * Camera Gallery Card
 */

import { LitElement, html } from "lit";

import { cardStyles } from "./styles";
import { STYLE_SECTIONS } from "./config/styling-config";
import { injectLiveFillStyle } from "./ui/live-fill-style";
import {
  dayKeyFromMs,
  dtKeyFromMs,
} from "./data/datetime-parsing";
import { configDiff } from "./config/diff";
import { migrateLegacyKeys, normalizeConfig } from "./config/normalize";
import {
  filterLabel,
  filterLabelList,
  objectColor,
  objectIcon,
} from "./data/object-filters";
import { FavoritesStore } from "./data/favorites";
import {
  parseServiceParts,
  SensorSourceClient,
  toWebPath,
} from "./data/sensor-source";
import {
  isMediaSourceId,
  keyFromRoots as msKeyFromRoots,
  MediaSourceClient,
} from "./data/media-walker";
import { collectMediaSamples, scoreSamples } from "./data/path-format-detect";
import { CombinedSourceClient } from "./data/combined-source";
import { canDeleteItem, deleteItem } from "./data/delete-service";
import { PendingPosterCollector, PosterCacheClient } from "./data/poster-cache";
import { ItemPipelineClient } from "./data/item-pipeline";
import {
  detectObjectForSrc,
  isVideoForSrc as viewIsVideoForSrc,
  isVideoSmart,
  matchesObjectFilter as viewMatchesObjectFilter,
  matchesTypeFilter,
  normalizeFilterArray,
} from "./data/view-filters";
import {
  circularNav,
  nextInList,
  prevInList,
  stepDay,
} from "./data/navigation";
import {
  friendlyCameraName as liveFriendlyCameraName,
  getAllLiveCameraEntities,
  getGridCameraEntities,
  getLiveCameraOptions,
  getStreamEntries,
  getStreamEntryById,
  gridDims,
  hasAnyMicStream,
  hasLiveConfig,
  isGridLayout,
  micStreamForCamera,
} from "./data/live-config";
import { WebRtcMicClient } from "./data/webrtc-mic";
import { buildDiagnostics, diagnosticsToText } from "./data/diagnostics";
import {
  FRIGATE_URI_PREFIX,
  frigateEventIdFromSrc,
  hasFrigateConfig,
  isFrigateRecordingsRoot,
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
      _errorToast: { type: Object },
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
      _micState: { type: String },
      _micErrorCode: { type: String },
      _micLevelTick: { type: Number },
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
    this._deletedFrigateEventIds = new Set();
    this._forceThumbReset = false;
    this._liveCard = null;
    this._liveCardConfigKey = "";
    // Runtime override of `live_layout`. null = follow config; "single" =
    // user tapped a grid tile and we're temporarily in single-camera mode.
    this._liveLayoutOverride = null;
    // Per-tile player elements when in grid layout, keyed by camera entity.
    this._liveGridTiles = new Map();
    this._liveCardPending = null;
    this._rtcPeerConnection = null;
    this._rtcWebSocket = null;
    this._signedWsPath = null;
    this._signedWsPathTs = 0;
    this._micState = "idle";
    this._micErrorCode = "";
    this._micLevelTick = 0;
    this._micLevelRaf = null;
    this._micClient = new WebRtcMicClient({
      inputs: {
        signPath: (path) =>
          this._hass
            ? this._hass.callWS({ type: "auth/sign_path", path })
            : Promise.reject(new Error("hass not ready")),
        buildWsUrl: (signed, streamName) =>
          "ws" +
          this._hass.hassUrl(signed.path).substring(4) +
          "&url=" +
          encodeURIComponent(streamName),
        notify: (err) => {
          try {
            this._hass?.callService("persistent_notification", "create", {
              title: "Camera Gallery Card — microphone",
              message: this._micErrorLabelForCode(err.code, err.detail),
              notification_id: "cgc_mic_error",
            });
          } catch (_) {
            /* persistent_notification.create unavailable */
          }
        },
      },
      onChange: () => {
        const next = this._micClient.state();
        if (next !== this._micState) this._micState = next;
        const errCode = this._micClient.error()?.code ?? "";
        if (errCode !== this._micErrorCode) this._micErrorCode = errCode;
        this._scheduleMicLevelRaf();
        this.requestUpdate();
      },
      audioProcessing: this._micAudioProcessingFromConfig(),
      iceServers: this._micIceServersFromConfig(),
      iceTransportPolicy: this.config?.live_mic_force_relay ? "relay" : "all",
    });
    this._autoAspectVideo = null;
    this._autoAspectObs = null;
    this._liveQuickSwitchTimer = null;
    this._navHideT = null;
    this._objectFilters = [];
    this._filterVideo = false;
    this._filterImage = false;
    this._filterFavorites = false;
    this._pendingScrollToI = null;
    // Unsubscribe callback for HA WS Frigate-event-push subscription.
    // null = not subscribed, function = active subscription.
    this._frigateEventsUnsub = null;
    this._objectCache = new Map();
    this._previewOpen = false;
    this._selectMode = false;
    this._selectedSet = new Set();
    this._showBulkHint = false;
    this._bulkHintTimer = null;
    this._errorToast = null;
    this._errorToastTimer = null;
    this._showDatePicker = false;
    this._datePickerDays = null;
    this._showLivePicker = false;
    this._showLiveQuickSwitch = false;
    this._debugOpen = false;
    this._showNav = false;
    this._pillsVisible = false;
    this._pillsHovered = false;
    this._pillsTimer = null;
    this._pillsHideActive = false;
    this._sensorClient = new SensorSourceClient({
      onChange: () => {
        this._pipeline?.invalidate();
        this.requestUpdate();
      },
    });
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
    this._onMicPointerDown = (e) => {
      e.stopPropagation();
      // Resolve the mic stream for the camera that's currently in focus.
      // Different cameras can have different backchannels; a camera with
      // no entry in `live_mic_streams` (and no legacy fallback) returns ""
      // and the pill should already be hidden — defensive check below.
      const cameraId = this._getEffectiveLiveCamera();
      const streamName = micStreamForCamera(cameraId, this.config);
      if (!streamName) return;
      const mode = this.config?.live_mic_mode ?? "toggle";
      if (mode === "ptt") {
        if (this._micState === "idle") void this._micClient.start(streamName);
      } else {
        void this._micClient.toggle(streamName);
      }
    };
    this._onMicPointerUp = (e) => {
      e.stopPropagation();
      if (this.config?.live_mic_mode === "ptt" && this._micState !== "idle") {
        this._micClient.stop();
      }
    };
    // Gallery video mute state. Mirrors the live-view pattern: the
    // initial value comes from `config.auto_muted` (default true), but
    // the user can override at runtime via the gallery mute pill — that
    // override sticks until the next config change.
    this._galleryMuted = true;
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


    this._onLiveCameraKeydown = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (!this._isLiveActive()) return;
      if (this._imgFsOpen) return;
      if (this._getLiveCameraOptions().length <= 1) return;
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) return;
      const focusInside = this.contains(document.activeElement);
      const hovered = this.matches(":hover");
      if (!focusInside && !hovered) return;
      e.preventDefault();
      this._navLiveCamera(e.key === "ArrowRight" ? 1 : -1);
    };

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
      if (isGridLayout(this.config, this._liveLayoutOverride)) return;
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
      if (isGridLayout(this.config, this._liveLayoutOverride)) return;
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
      if (isGridLayout(this.config, this._liveLayoutOverride)) return;
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
      if (isGridLayout(this.config, this._liveLayoutOverride)) return;
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
      onChange: () => {
        // Audit-fix #1: object detection caches `src → ObjectFilter`. When
        // the media client re-resolves a media-source ID the recorded
        // title/mime can change, so any cached detection must be flushed
        // alongside the items rev bump.
        this._objectCache?.clear?.();
        this._pipeline?.invalidate();
        this.requestUpdate();
      },
      getDtOpts: () => this._dtOpts,
      resolveItemMs: (src) => this._pipeline?.resolveItemMs(src) ?? null,
    });
    this._combinedClient = new CombinedSourceClient(this._sensorClient, this._mediaClient);

    // Items + base-list cache live on the pipeline client (see
    // `src/data/item-pipeline.ts`). The two source clients fire `onChange`
    // when their contents change → `invalidate()` on the pipeline →
    // `requestUpdate()`. Cache key is (itemsRev, selectedDay, objectFilters
    // ref, sortOrder) so each render pays the sort exactly once.
    this._pipeline = new ItemPipelineClient({
      sensorClient: this._sensorClient,
      mediaClient: this._mediaClient,
      combinedClient: this._combinedClient,
      getSourceMode: () => this.config?.source_mode,
      getSortOrder: () => this.config?.thumb_sort_order,
      getSelectedDay: () => this._selectedDay ?? null,
      getObjectFilters: () => this._objectFilters ?? [],
      getDtOpts: () => this._dtOpts,
      getDeleted: () => this._deleted ?? new Set(),
      getDeletedFrigateEventIds: () => this._deletedFrigateEventIds ?? new Set(),
      matchesObjectFilter: (src) => this._matchesObjectFilter(src),
      isVideoForSrc: (src) => this._isVideoForSrc(src),
      onChange: () => this.requestUpdate(),
    });
    this._previewLoadTimer = null;

    this._revealedThumbs = new Set();
    this._thumbObserver = null;
    this._thumbObserverRoot = null;
    this._observedThumbs = new WeakSet();

    // Poster pipeline lives in its own client. Inputs are closures over the
    // sensor/media clients + config so the poster module never imports them
    // directly. See `src/data/poster-cache.ts`.
    this._posterClient = new PosterCacheClient({
      inputs: {
        getSensorPairedThumbs: () => this._sensorClient.getSensorPairedThumbs(),
        getMediaPairedThumbs: () => this._mediaClient.getPairedThumbs(),
        getMediaUrlCache: () => this._mediaClient.getUrlCache(),
        findMatchingSnapshotMediaId: (src) =>
          this._mediaClient.findMatchingSnapshotMediaId(src),
        isResolveFailed: (id) => this._mediaClient.isResolveFailed(id),
        hasFrigate: () => hasFrigateConfig(this.config),
        captureAllowed: () => this.config?.capture_video_thumbnails !== false,
        framePct: () => this.config?.thumbnail_frame_pct ?? DEFAULT_THUMBNAIL_FRAME_PCT,
        isRevealed: (src) => this._revealedThumbs.has(src),
        getAuthToken: () => this._hass?.auth?.data?.access_token ?? null,
        getOrigin: () => window.location.origin,
      },
      onChange: () => this.requestUpdate(),
    });
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
    window.addEventListener('keydown', this._onLiveCameraKeydown);
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
    window.removeEventListener('keydown', this._onLiveCameraKeydown);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

    this._stopMediaPoll();
    this._unsubscribeFrigateEvents();
    if (this._liveQuickSwitchTimer) clearTimeout(this._liveQuickSwitchTimer);
    if (this._navHideT) clearTimeout(this._navHideT);
    if (this._bulkHintTimer) clearTimeout(this._bulkHintTimer);
    this._cancelMicLevelRaf();

    this._liveQuickSwitchTimer = null;
    this._navHideT = null;
    this._bulkHintTimer = null;

    this._clearPreviewVideoHostPlayback();
    this._teardownLiveView();

    this._clearThumbLongPress();

    if (this._thumbObserver) {
      this._thumbObserver.disconnect();
      this._thumbObserver = null;
    }

    // Aborts in-flight captures and revokes every mirrored blob URL.
    // Without this, every captured poster's `URL.createObjectURL` leaked
    // on card teardown.
    this._posterClient.dispose();

    // Aborts any pending mic handshake, closes PC/WS/tracks, suspends
    // (but doesn't close) the AudioContext so a tab-switch / reconnect
    // can resume cheaply. We call stop() rather than dispose() because
    // HA Lovelace fires disconnect+connect on tab navigation without
    // destroying the JS object — dispose() would leave the client
    // permanently sealed and every subsequent mic toggle would silently
    // no-op.
    this._micClient.stop();
  }

  set hass(hass) {
    const firstHass = !this._hass;
    const oldHass = this._hass;
    this._hass = hass;
    this._sensorClient.setHass(hass);
    this._mediaClient.setHass(hass);
    this._posterClient.setHass(hass);

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

    // Bypass freshness gate so the next ensureLoaded re-runs calendar
    // discovery and re-fetches the visible day.
    this._mediaClient.invalidate();
    this._mediaClient.ensureLoaded();
  }

  // ─── Generic helpers ───────────────────────────────────────────────

  _syncPreviewPlaybackFromState() {
    if (!this._hass || !this.config) return;

    const usingMediaSource = this.config?.source_mode === "media" || this.config?.source_mode === "combined";
    const base = this._pipeline.getBaseList();

    if (!base.rawItems.length) {
      this._clearPreviewVideoHostPlayback();
      return;
    }

    const filteredAll = base.objFiltered.filter((x) => this._matchesTypeFilter(x.src));
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

  _queueSensorPosterWork(items) {
    if (!Array.isArray(items) || !items.length) return;
    if (this.config?.source_mode !== "sensor" && this.config?.source_mode !== "combined") return;

    // Only enqueue cheap server-thumbnail fetches (paired jpgs).
    // The raw video URL would require pulling the entire file just
    // to extract a single frame; that capture is deferred until the
    // user actually selects the item (preview-video `canplay` fires
    // `client.enqueue` then).
    const pairedThumbs = this._sensorClient.getSensorPairedThumbs();
    for (const it of items) {
      const src = String(it?.src || "");
      if (!src) continue;
      if (!isVideo(src)) continue;
      const pairedJpg = pairedThumbs.get(src);
      if (pairedJpg) this._posterClient.enqueue(pairedJpg);
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
    // Honor the runtime mute toggle from the gallery pill — `_galleryMuted`
    // is seeded from `config.auto_muted` and then overridden by user clicks.
    const shouldMute = this._galleryMuted;

    // Don't use the `autoplay` attribute — when the browser starts an
    // internal play() because of `autoplay=true` and we then change `src`,
    // the internal play() promise rejects with `aborted by the user agent`
    // and surfaces as `Uncaught (in promise) DOMException`. We start
    // playback explicitly via `canplay` below and own the .catch.
    video.autoplay = false;
    video.muted = shouldMute;

    if (video.src !== selectedUrl) {
      // Tear down any listeners from the previous URL before swapping.
      // Without an AbortController, the previous src's `{ once: true }`
      // canplay/error listeners are still attached — and the
      // `removeAttribute("src") + load()` we're about to do can fire
      // `error` for the aborted load, which the stale closure would
      // attribute to the OLD url (poisoning the poster-client failure
      // ledger for a perfectly good URL the user just navigated away from).
      this._previewLoadAbort?.abort();
      const abortController = new AbortController();
      this._previewLoadAbort = abortController;
      const sig = abortController.signal;

      // Cancel any in-flight load on the previous src before swapping. Without
      // this, Firefox surfaces the browser-internal fetch abort as
      // `Uncaught (in promise) DOMException: aborted by the user agent` —
      // harmless, but it spams the console on every quick thumb-to-thumb tap.
      if (video.src) {
        try { video.pause(); } catch (_) {}
        try { video.removeAttribute("src"); video.load(); } catch (_) {}
      }

      video.src = selectedUrl;

      const poster = this._posterClient.getPosterUrl(selectedUrl) || "";
      if (poster) {
        video.poster = poster;
      } else {
        video.removeAttribute("poster");
        // Enqueue poster pas na laden: voorkomt dat de capture de preview-verbinding blokkeert
        const urlForPoster = selectedUrl;
        video.addEventListener("canplay", () => {
          if (!this._posterClient.getPosterUrl(urlForPoster)) {
            this._posterClient.enqueue(urlForPoster);
          }
        }, { once: true, signal: sig });
        // If the preview can't load (broken / corrupt / slow-network),
        // record the failure so the thumb gets a broken icon (hard
        // errors) or stays on the skeleton until the cooldown lapses
        // (soft errors — which is what 99% of slow-network blips are).
        video.addEventListener("error", () => {
          const code = video.error?.code;
          // MediaError.code: 1=ABORTED, 2=NETWORK, 3=DECODE, 4=SRC_NOT_SUPPORTED.
          // 3 & 4 are extraction-side ("file got here, can't decode") —
          // mark hard so we don't retry. 1 (aborted) & 2 (network)
          // can recover on a retry once the connection improves.
          const isHard = code === 3 || code === 4;
          this._posterClient.recordFailure(urlForPoster, { hard: isHard });
          if (isHard) this._posterClient.dropCachedThumb(urlForPoster);
          this.requestUpdate();
        }, { once: true, signal: sig });
      }

      if (shouldAutoplay) {
        // video.load() reset muted in sommige browsers naar defaultMuted.
        // Herstel muted ná load en start expliciet via play() zodat autoplay
        // niet afhankelijk is van een recente user-gesture (relevant in MS mode
        // waar de URL async wordt opgelost en de gesture al "oud" is).
        video.addEventListener("canplay", () => {
          video.muted = shouldMute;
          video.play().catch(() => {});
        }, { once: true, signal: sig });
      }

      try {
        video.load();
      } catch (_) {}
    } else {
      const poster = this._posterClient.getPosterUrl(selectedUrl) || "";
      if (poster && video.poster !== poster) {
        video.poster = poster;
      }
    }
  }

  _clearPreviewVideoHostPlayback() {
    const host = this.renderRoot?.querySelector("#preview-video-host");

    // Detach any error/canplay listeners attached to the previous src.
    this._previewLoadAbort?.abort();
    this._previewLoadAbort = null;

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
    // Audit-fix #7: resolve locale once per call, not once per comparator
    // tick. `getAllLiveCameraEntities` consults this once for sort.
    return getAllLiveCameraEntities({
      config: this.config,
      hassStates: this._hass?.states,
      localeTag: resolveLocale(this._hass),
      friendlyName: (id) => this._friendlyCameraName(id),
    });
  }

  _thumbCanMultipleDelete() {
    if (!this.config?.allow_bulk_delete) return false;
    const hasSensorService = !!parseServiceParts(this.config?.delete_service);
    const hasFrigateService = !!parseServiceParts(this.config?.frigate_delete_service);
    return hasSensorService || hasFrigateService;
  }

  _friendlyCameraName(entityId) {
    return liveFriendlyCameraName({
      entityId,
      config: this.config,
      hassStates: this._hass?.states,
    });
  }

  _isThumbLayoutVertical() {
    return this.config?.thumb_layout === "vertical";
  }

  // Options bag for the pure datetime-parsing functions.
  // Reads config each access; cheap allocation, no caching needed.
  get _dtOpts() {
    return {
      pathFormat: this.config?.path_datetime_format ?? "",
    };
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

  _showErrorToast(title, message) {
    if (this._errorToastTimer) {
      clearTimeout(this._errorToastTimer);
      this._errorToastTimer = null;
    }
    this._errorToast = { title, message };
    this.requestUpdate();
    this._errorToastTimer = setTimeout(() => {
      this._errorToast = null;
      this._errorToastTimer = null;
      this.requestUpdate();
    }, 8000);
  }

  _dismissErrorToast() {
    if (this._errorToastTimer) {
      clearTimeout(this._errorToastTimer);
      this._errorToastTimer = null;
    }
    this._errorToast = null;
    this.requestUpdate();
  }

  // ─── Normalizers / config helpers ─────────────────────────────────

  _getVisibleObjectFilters() {
    return Array.isArray(this.config?.object_filters)
      ? this.config.object_filters
      : [];
  }

  _hasLiveConfig() {
    const streamCount = getStreamEntries(this.config).length;
    const cameraCount = streamCount > 0
      ? 0
      : this._getAllLiveCameraEntities().length;
    return hasLiveConfig({ config: this.config, streamCount, cameraCount });
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

  // ─── Debug / diagnostics ──────────────────────────────────────────

  _openDebug() {
    this._debugOpen = true;
    this.requestUpdate();
  }

  _closeDebug() {
    this._debugOpen = false;
    this.requestUpdate();
  }

  async _probeCameraResolution(entityId) {
    if (!this._diagResolutions) this._diagResolutions = {};
    const cache = this._diagResolutions;
    if (cache[entityId]) return;
    const st = this._hass?.states?.[entityId];
    if (!st) { cache[entityId] = { state: "unavailable" }; return; }
    cache[entityId] = { state: "loading" };

    const tryProbe = async (url) => {
      const r = await fetch(url, { cache: "no-store", credentials: "same-origin" });
      if (!r.ok) return { error: `HTTP ${r.status}` };
      const blob = await r.blob();
      const objUrl = URL.createObjectURL(blob);
      try {
        return await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve({ error: "decode failed" });
          img.src = objUrl;
        });
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    };

    const sources = [];
    if (st.attributes?.entity_picture) sources.push(st.attributes.entity_picture);
    const frigateBase = (this.config?.frigate_url || "").replace(/\/+$/, "");
    const frigateCam = st.attributes?.camera_name;
    if (frigateBase && frigateCam) sources.push(`${frigateBase}/api/${frigateCam}/latest.jpg`);

    if (!sources.length) { cache[entityId] = { state: "unavailable" }; this.requestUpdate(); return; }

    let lastReason = "no source";
    for (const src of sources) {
      try {
        const out = await tryProbe(src);
        if (out.w && out.h) {
          cache[entityId] = { state: "ok", w: out.w, h: out.h };
          this.requestUpdate();
          return;
        }
        lastReason = out.error || "unknown";
      } catch (e) {
        lastReason = e?.message || "fetch failed";
      }
    }
    cache[entityId] = { state: "error", reason: lastReason };
    this.requestUpdate();
  }

  _buildDiagnostics() {
    // Kick off async probes for every configured camera. The probes mutate
    // `_diagResolutions` and call `requestUpdate()` when results arrive;
    // the pure builder below just reads the latched results.
    const cams = Array.isArray(this.config?.live_camera_entities)
      ? this.config.live_camera_entities
      : [];
    for (const id of cams) this._probeCameraResolution(id);

    return buildDiagnostics({
      cardVersion: typeof CARD_VERSION === "string" ? CARD_VERSION : "",
      viewMode: this._viewMode,
      hass: this._hass,
      config: this.config,
      mediaState: this._mediaClient?.state ?? {},
      frigateEventsActive: !!this._frigateEventsUnsub,
      liveCardMounted: !!this._liveCard,
      liveLayoutOverride: this._liveLayoutOverride ?? null,
      cameraResolutions: this._diagResolutions ?? {},
      navigatorInfo: {
        userAgent: navigator.userAgent,
        onLine: navigator.onLine !== false,
      },
      micStats: this._micClient?.stats() ?? null,
      micError: this._micClient?.error() ?? null,
    });
  }

  _diagnosticsToText() {
    return diagnosticsToText(this._buildDiagnostics(), new Date());
  }

  async _copyDebug() {
    const text = this._diagnosticsToText();
    try {
      await navigator.clipboard.writeText(text);
      this._debugCopied = true;
      this.requestUpdate();
      setTimeout(() => { this._debugCopied = false; this.requestUpdate(); }, 2000);
    } catch (_clipErr) {
      // Fallback for older webviews
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        this._debugCopied = true;
        this.requestUpdate();
        setTimeout(() => { this._debugCopied = false; this.requestUpdate(); }, 2000);
      } catch (_fallbackErr) { /* swallow */ }
    }
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
    return getStreamEntries(this.config);
  }

  _getStreamEntryById(id) {
    return getStreamEntryById(this.config, id);
  }

  _getLiveCameraOptions() {
    return getLiveCameraOptions({
      config: this.config,
      hassStates: this._hass?.states,
      localeTag: resolveLocale(this._hass),
      friendlyName: (id) => this._friendlyCameraName(id),
    });
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

  _toggleGalleryMute() {
    this._galleryMuted = !this._galleryMuted;
    if (this._previewVideoEl) this._previewVideoEl.muted = this._galleryMuted;
    this.requestUpdate();
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
    const ua = navigator.userAgent || "";
    // HA Companion's Android WebView mishandles requestFullscreen on a
    // custom element (system bar hides but the element doesn't fill the
    // viewport). The CSS fallback works correctly there. iOS Companion is
    // unaffected because the video.webkitEnterFullscreen path runs first.
    const isAndroidWebView = /Android/.test(ua) && (/Home Assistant\//.test(ua) || /; wv\)/.test(ua));

    // Uitgang fullscreen
    if (document.fullscreenElement || document.webkitFullscreenElement || this._liveFullscreen) {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document).catch(() => {});
        return;
      }
      // CSS-fallback exit
      this._liveFullscreen = false;
      this._resetZoom();
      this.removeAttribute("data-live-fs");
      this.requestUpdate();
      return;
    }

    // iOS Safari: webkitEnterFullscreen op video element
    if (video && video.webkitSupportsFullscreen) {
      video.webkitEnterFullscreen();
      return;
    }

    // Android WebView: skip native API, go to CSS fallback (zie boven)
    if (!isAndroidWebView && document.fullscreenEnabled) {
      this.requestFullscreen().catch(() => {});
      return;
    }

    // CSS fallback (Android WebView, of geen native fullscreen support)
    this._liveFullscreen = true;
    this.setAttribute("data-live-fs", "");
    this.requestUpdate();
  }

  _openImageFullscreen() {
    this._imgFsOpen = true;
    try { this._previewVideoEl?.pause(); } catch (_) {}
    try { screen.orientation?.lock?.("landscape"); } catch (_) {}
    this._showPills();
    if (!this._onImgFsKeydown) {
      this._onImgFsKeydown = (e) => {
        if (!this._imgFsOpen) return;
        if (e.key === "Escape") {
          e.preventDefault();
          this._closeImageFullscreen();
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          const dir = e.key === "ArrowRight" ? 1 : -1;
          const { items } = this._currentFilteredItems();
          this._navImgFs(dir, items.length);
          e.preventDefault();
        }
      };
    }
    window.addEventListener("keydown", this._onImgFsKeydown);
    this.requestUpdate();
  }

  _closeImageFullscreen() {
    this._imgFsOpen = false;
    if (this._onImgFsKeydown) {
      window.removeEventListener("keydown", this._onImgFsKeydown);
    }
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

  // Mic state lives in `this._micClient` (a WebRtcMicClient). The card just
  // mirrors `state()` / `error()` into reactive Lit properties via the
  // client's `onChange` callback so the render branches stay declarative.

  // Translate the YAML `live_mic_audio_processing` snake-case shape into the
  // camel-case MediaTrackConstraints fields the client expects. Missing
  // sub-keys leave the corresponding client-side default (all-true) in place.
  _micAudioProcessingFromConfig() {
    const ap = this.config?.live_mic_audio_processing;
    if (!ap || typeof ap !== "object") return undefined;
    const out = {};
    if (typeof ap.echo_cancellation === "boolean") out.echoCancellation = ap.echo_cancellation;
    if (typeof ap.noise_suppression === "boolean") out.noiseSuppression = ap.noise_suppression;
    if (typeof ap.auto_gain_control === "boolean") out.autoGainControl = ap.auto_gain_control;
    return Object.keys(out).length > 0 ? out : undefined;
  }

  // Pass-through for `live_mic_ice_servers`. Returns undefined when the
  // user hasn't configured custom ICE servers — the client then keeps its
  // built-in STUN/TURN list.
  _micIceServersFromConfig() {
    const arr = this.config?.live_mic_ice_servers;
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    return arr;
  }

  // The mic client computes input level in an RAF loop while active. We don't
  // want the client to driveLit re-renders at 20Hz directly (each requestUpdate
  // schedules a paint); instead, while active, we tick a counter at the same
  // 20Hz cadence and that's the only Lit-observable that ratchets — the level
  // value itself is read synchronously from the client during render.
  _scheduleMicLevelRaf() {
    if (this._micState !== "active") {
      this._cancelMicLevelRaf();
      return;
    }
    if (this._micLevelRaf !== null) return;
    const tick = () => {
      if (this._micState !== "active") {
        this._micLevelRaf = null;
        return;
      }
      this._micLevelTick = (this._micLevelTick + 1) | 0;
      this.requestUpdate();
      this._micLevelRaf = requestAnimationFrame(tick);
    };
    this._micLevelRaf = requestAnimationFrame(tick);
  }

  _cancelMicLevelRaf() {
    if (this._micLevelRaf !== null) {
      cancelAnimationFrame(this._micLevelRaf);
      this._micLevelRaf = null;
    }
  }

  _onGridTileTap(entity) {
    this._liveLayoutOverride = "single";
    this._liveSelectedCamera = entity;
    this._clearLiveGrid();
    this.requestUpdate();
    setTimeout(() => this._mountLiveCard(), 0);
  }

  _returnToGrid() {
    this._liveLayoutOverride = null;
    // Tear down the single-camera player so the grid mount starts clean. Going
    // through the shared helper also closes any PC/WS the URL-fast-path opened.
    this._teardownLiveView();
    this.requestUpdate();
    setTimeout(() => this._mountLiveCard(), 0);
  }

  _clearLiveGrid() {
    const host = this.renderRoot?.querySelector("#live-card-host");
    if (host && host.classList.contains("live-grid-host")) {
      host.classList.remove("live-grid-host");
      host.innerHTML = "";
    }
    this._liveGridTiles.clear();
  }

  async _mountLiveGrid() {
    if (!this._isLiveActive()) return;
    const host = this.renderRoot?.querySelector("#live-card-host");
    if (!host) return;

    const cameras = getGridCameraEntities(this.config);
    const { cols, rows } = gridDims(cameras.length);

    if (!host.classList.contains("live-grid-host")) {
      host.classList.add("live-grid-host");
      host.innerHTML = "";
      this._liveGridTiles.clear();
    }
    host.style.setProperty("--cgc-grid-cols", String(cols));
    host.style.setProperty("--cgc-grid-rows", String(rows));
    host.classList.toggle("live-grid-no-labels", this.config?.live_grid_labels === false);

    // Remove tiles for cameras no longer present.
    const wanted = new Set(cameras);
    for (const [entity, tile] of this._liveGridTiles) {
      if (!wanted.has(entity)) {
        try { tile.remove(); } catch (_) {}
        this._liveGridTiles.delete(entity);
      }
    }

    await customElements.whenDefined("ha-camera-stream");
    for (const entity of cameras) {
      const existing = this._liveGridTiles.get(entity);
      if (existing) {
        const stream = existing.querySelector("ha-camera-stream");
        if (stream) {
          stream.hass = this._hass;
          const so = this._hass?.states?.[entity];
          if (so?.last_changed !== stream.stateObj?.last_changed) stream.stateObj = so;
        }
        continue;
      }

      const tile = document.createElement("div");
      tile.className = "live-grid-tile";
      tile.dataset.entity = entity;
      tile.addEventListener("click", () => this._onGridTileTap(entity));

      const stream = document.createElement("ha-camera-stream");
      stream.stateObj = this._hass?.states?.[entity];
      stream.hass = this._hass;
      stream.muted = true;
      stream.controls = false;
      stream.style.cssText = "display:block;width:100%;height:100%;object-fit:cover;";
      tile.appendChild(stream);

      const label = document.createElement("div");
      label.className = "live-grid-label";
      label.textContent = this._hass?.states?.[entity]?.attributes?.friendly_name || entity;
      tile.appendChild(label);

      host.appendChild(tile);
      this._liveGridTiles.set(entity, tile);
      injectLiveFillStyle(stream);
    }
  }

  async _mountLiveCard() {
    if (!this._isLiveActive()) return;

    const host = this.renderRoot?.querySelector("#live-card-host");
    if (!host) return;

    if (isGridLayout(this.config, this._liveLayoutOverride)) {
      // Tear down a previously-mounted single player before switching to grid.
      // Routing through the shared helper also closes URL-fast-path PC/WS that
      // remove() alone leaves dangling.
      if (this._liveCard) this._teardownLiveView();
      return this._mountLiveGrid();
    }

    // Single mode — clean up any leftover grid tiles first.
    this._clearLiveGrid();

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
      injectLiveFillStyle(card);
      this._liveMuted = this.config?.live_auto_muted !== false;
      this._syncLiveMuted();
    }

    // Altijd opnieuw uitvoeren: _setViewMode reset _aspectRatio naar config-waarde,
    // ook als de stream al pre-warmed was en de video al dimensies heeft.
    this._setupAutoAspectRatio();
  }

  // Fully releases the live view: stops playback, closes WebRTC, detaches the
  // mounted card, and clears grid tiles. Safe to call when nothing is mounted.
  // Why: ha-camera-stream's disconnectedCallback handles its own tree, but the
  // URL-fast-path holds a PC + WS on `this` that won't close just by removing
  // the <video>, and `display:none` doesn't pause playback either — so a card
  // left mounted in media mode keeps streaming and audible (issue #109).
  _teardownLiveView() {
    if (this._autoAspectObs) {
      clearInterval(this._autoAspectObs);
      this._autoAspectObs = null;
    }
    this._autoAspectVideo = null;

    // Pause first so audio stops before we wait on element removal.
    const video = this._findLiveVideo();
    if (video) {
      try { video.pause(); } catch (_) {}
      try { video.srcObject = null; } catch (_) {}
    }

    if (this._rtcWebSocket) {
      try { this._rtcWebSocket.close(); } catch (_) {}
      this._rtcWebSocket = null;
    }
    if (this._rtcPeerConnection) {
      try { this._rtcPeerConnection.close(); } catch (_) {}
      this._rtcPeerConnection = null;
    }
    this._liveCardPending = null;

    // Push-to-talk mic shares the live view's lifecycle; if it's still hot
    // when we leave live, the user keeps transmitting from the gallery view.
    this._micClient.stop();

    const host = this.renderRoot?.querySelector("#live-card-host");
    if (this._liveCard && host && host.contains(this._liveCard)) {
      try { this._liveCard.remove(); } catch (_) {}
    }
    this._liveCard = null;
    this._liveCardConfigKey = "";

    this._clearLiveGrid();
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

  // ─── Mic pill (two-way audio toggle) ──────────────────────────────────
  //
  // Only rendered when the *currently active* camera has a configured
  // mic stream. The card carries a per-camera map (`live_mic_streams`)
  // so a multi-camera setup can have mic talkback on some entries and
  // not others — the pill appears/disappears as the user navigates the
  // picker. Visual states:
  //   - idle      → outlined microphone-outline icon
  //   - connecting→ spinning loading icon, button disabled to prevent
  //                 racing a second handshake before the first lands
  //   - active    → solid microphone icon, red pulsing background, the
  //                 audio-level ring (via --cgc-mic-level CSS variable)
  //                 scales with input volume
  //   - error     → microphone-off icon, red inset shadow; auto-clears
  //                 when the client's auto-clear timer fires (8 s)
  //
  // The error message is rendered as a small toast inside the controls bar
  // (separate live region) so screen readers announce failures via aria-live.
  _renderMicPill() {
    const cameraId = this._getEffectiveLiveCamera();
    const streamName = micStreamForCamera(cameraId, this.config);
    if (!streamName) return html``;
    const state = this._micState;
    const err = this._micErrorCode;
    const isPtt = this.config?.live_mic_mode === "ptt";
    const cls =
      state === "active"
        ? "mic-active"
        : state === "connecting"
          ? "mic-connecting"
          : err
            ? "mic-error"
            : "mic-idle";
    const icon =
      state === "active"
        ? "mdi:microphone"
        : state === "connecting"
          ? "mdi:loading"
          : err
            ? "mdi:microphone-off"
            : "mdi:microphone-outline";
    const labelBase = isPtt ? "Microphone (push-to-talk)" : "Microphone";
    const stateLabel =
      state === "active"
        ? "on"
        : state === "connecting"
          ? "connecting"
          : err
            ? `error: ${err}`
            : "off";
    const ariaLabel = `${labelBase} (${stateLabel})`;
    const level = this._micClient.level();
    const styleVar = state === "active" ? `--cgc-mic-level:${Math.min(1, level).toFixed(3)};` : "";
    return html`
      <button
        class="gallery-pill live-pill-btn mic-pill ${cls} ${isPtt ? "mic-ptt" : ""}"
        aria-label=${ariaLabel}
        aria-pressed=${state === "active" ? "true" : "false"}
        ?disabled=${state === "connecting"}
        title=${ariaLabel}
        style=${styleVar}
        @pointerdown=${this._onMicPointerDown}
        @pointerup=${this._onMicPointerUp}
        @pointercancel=${this._onMicPointerUp}
        @pointerleave=${this._onMicPointerUp}
      >
        <span class="mic-level-ring" aria-hidden="true"></span>
        <ha-icon icon=${icon}></ha-icon>
        ${isPtt && state === "idle" ? html`<span class="mic-ptt-hint" aria-hidden="true">HOLD</span>` : html``}
      </button>
    `;
  }

  // Live-region toast for mic errors. Sits inside the live-controls-bar so
  // it doesn't shift the rest of the page. role=status + aria-live=polite
  // lets screen readers announce the failure without interrupting other
  // focus.
  _renderMicErrorToast() {
    if (!hasAnyMicStream(this.config)) return html``;
    const label = this._micErrorLabel();
    return html`
      <div class="mic-error-toast ${label ? "visible" : ""}" role="status" aria-live="polite">
        ${label
          ? html`<ha-icon icon="mdi:alert-circle"></ha-icon><span>${label}</span>`
          : html``}
      </div>
    `;
  }

  // English user-facing string per MicErrorCode. Returns "" for empty or
  // "aborted" so the toast template can short-circuit. Shared by the
  // in-card toast and the HA persistent_notification payload so users
  // never see internal codes like `ws-server-error`. PR 15 (i18n) will
  // route this through hass.localize.
  _micErrorLabelForCode(code, detail) {
    switch (code) {
      case "https-required":
        return "Microphone requires HTTPS or localhost.";
      case "permission-denied":
        return "Microphone permission denied. Check browser settings.";
      case "device-not-found":
        return "No microphone found on this device.";
      case "device-in-use":
        return "Microphone is being used by another app.";
      case "stream-not-found":
        return "No go2rtc stream configured for this camera.";
      case "ws-connect-failed":
        return "Couldn't reach go2rtc. Check that the WebRTC Camera integration is installed.";
      case "ws-timeout":
        return "go2rtc handshake timed out. Check the network.";
      case "ws-server-error":
        // Echo the server's reason so users with a typo'd stream name can
        // self-diagnose ("go2rtc reported: no such stream front_dor").
        return detail ? `go2rtc reported: ${detail}` : "go2rtc reported an error.";
      case "ice-failed":
        return "Network blocks WebRTC. Try a different network or configure TURN.";
      case "":
      case "aborted":
        return "";
      case "unknown":
      default:
        return detail ? `Microphone failed: ${detail}` : "Microphone failed.";
    }
  }

  _micErrorLabel() {
    return this._micErrorLabelForCode(this._micErrorCode, this._micClient.error()?.detail);
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
    // Full teardown of the current card before swapping cameras: URL→entity
    // transitions otherwise leak the previous PC/WS, since _ensureLiveCard
    // doesn't know to close them.
    this._teardownLiveView();
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
    const next = options[circularNav(options.indexOf(current), dir, options.length)];
    if (next) {
      this._selectLiveCamera(next);
      this._showPills();
    }
  }

  _setViewMode(nextMode) {
    const mode = nextMode === "live" ? "live" : "media";
    if (mode === "live" && !this._hasLiveConfig()) return;

    const wasLive = this._viewMode === "live";
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
      if (wasLive) this._teardownLiveView();
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

  _renderDebugModal() {
    if (!this._debugOpen) return html``;
    const sections = this._buildDiagnostics();
    return html`
      <div class="cgc-debug-backdrop" @click=${() => this._closeDebug()}></div>
      <div class="cgc-debug-modal" @click=${(e) => e.stopPropagation()}>
        <div class="cgc-debug-head">
          <div class="cgc-debug-head-title">
            <ha-icon icon="mdi:bug-outline"></ha-icon>
            <span>Diagnostics</span>
          </div>
          <button class="cgc-debug-close" @click=${() => this._closeDebug()} aria-label="Close">
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
        </div>
        <div class="cgc-debug-body">
          ${sections.map(({ title, icon, rows }) => html`
            <div class="cgc-debug-section">
              <div class="cgc-debug-section-head">
                <ha-icon icon=${icon}></ha-icon>
                <span>${title}</span>
              </div>
              <div class="cgc-debug-rows">
                ${rows.map(([k, v, status]) => html`
                  <div class="cgc-debug-row">
                    <div class="cgc-debug-key">${k}</div>
                    <div class="cgc-debug-val ${status ? "has-status status-" + status : ""}">
                      ${status ? html`<span class="cgc-debug-dot"></span>` : html``}
                      <span class="cgc-debug-val-text">${v}</span>
                    </div>
                  </div>
                `)}
              </div>
            </div>
          `)}
        </div>
        <div class="cgc-debug-foot">
          <button class="cgc-debug-copy ${this._debugCopied ? "copied" : ""}" @click=${() => this._copyDebug()}>
            <ha-icon icon=${this._debugCopied ? "mdi:check" : "mdi:content-copy"}></ha-icon>
            <span>${this._debugCopied ? "Copied to clipboard" : "Copy full report"}</span>
          </button>
        </div>
      </div>
    `;
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
    if (!ok) {
      // Surface the failure via an in-card toast instead of swallowing it
      // silently — otherwise the user taps Delete, nothing happens, and they
      // have no idea why.
      const eventId = frigateEventIdFromSrc(src);
      const isFrigate = eventId !== null && isFrigateRoot(src);
      this._showErrorToast(
        "Delete failed",
        isFrigate
          ? `Frigate event could not be deleted. Check that the rest_command service is configured correctly and can reach Frigate.`
          : `File could not be deleted. Check the delete_service config and that the file still exists.`
      );
      return;
    }

    this._deleted.add(src);
    this._selectedSet?.delete?.(src);
    this._invalidateItems();

    // Frigate's DELETE /api/events/<id> wipes clip + paired snapshot in
    // one call, so any item whose URI carries the same event id should
    // be hidden together. Event-id-keyed filter survives URI shape and
    // re-fetches better than exact-URI-only matching.
    const eventId = frigateEventIdFromSrc(src);
    let alsoHidden = [];
    if (eventId) {
      this._deletedFrigateEventIds.add(eventId);
      alsoHidden = (this._mediaClient?.state?.list || [])
        .map((it) => it?.id)
        .filter((id) => id && id !== src && id.includes(eventId));
    }

    // Diagnostic log so testing can verify both the clip and the paired
    // snapshot get hidden after one delete.
    console.info(
      "[cgc delete]",
      eventId
        ? `Frigate event_id=${eventId} — deleted src=${src} — also hiding ${alsoHidden.length} matching item(s):`
        : `non-Frigate src=${src}`,
      alsoHidden
    );

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



  // Pipeline pass-throughs. The pipeline client owns the items+base-list
  // cache and the deletion filter; the card's `_pipeline.invalidate()` is
  // fired from setConfig, the source clients' onChange, and direct
  // `_deleted` mutations.
  _invalidateItems() {
    this._pipeline.invalidate();
  }

  _items() {
    return this._pipeline.getItems();
  }

  _computeBaseList() {
    return this._pipeline.getBaseList();
  }

  _currentFilteredItems() {
    const usingMediaSource = this.config?.source_mode === "media" || this.config?.source_mode === "combined";
    const base = this._computeBaseList();
    const filteredAll = (base?.objFiltered || []).filter((x) =>
      this._matchesTypeFilter(x.src) &&
      (!this._filterFavorites || this._favorites.has(x.src))
    );
    const cap = (this.config?.max_media ?? DEFAULT_MAX_MEDIA);
    const items = filteredAll.slice(0, Math.min(cap, filteredAll.length));
    return { items, usingMediaSource };
  }

  _allKnownDays(itemsWithDay) {
    return this._pipeline.getAllDays(itemsWithDay);
  }

  _resolveItemMs(src) {
    return this._pipeline.resolveItemMs(src);
  }

  _isVideoSmart(urlOrTitle, mime, cls) {
    return isVideoSmart(urlOrTitle, mime, cls);
  }

  _navImgFs(dir, listLen) {
    if (!this._imgFsOpen) return;
    const cur = this._selectedIndex ?? 0;
    const target = cur + (dir > 0 ? 1 : -1);
    if (target < 0 || target >= listLen) return;
    this._resetZoom?.();
    this._selectedIndex = target;
    this._pendingScrollToI = this._selectedIndex;
    this.requestUpdate();
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
    const next = stepDay(activeDay ?? null, delta, days ?? []);
    if (next === null) return;

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
    return normalizeFilterArray(this._objectFilters);
  }

  _isObjectFilterActive(value) {
    return this._activeObjectFilters().includes(
      String(value || "").toLowerCase().trim()
    );
  }

  _matchesObjectFilter(src) {
    return this._matchesObjectFilterValue(src, this._objectFilters);
  }

  _isVideoForSrc(src) {
    return viewIsVideoForSrc({
      src,
      isMediaSource: isMediaSourceId,
      getMeta: (id) => this._mediaClient.getMetaById(id),
    });
  }

  _matchesTypeFilter(src) {
    return matchesTypeFilter({
      src,
      filterVideo: !!this._filterVideo,
      filterImage: !!this._filterImage,
      isVideo: (s) => this._isVideoForSrc(s),
    });
  }

  _matchesObjectFilterValue(src, filterValues) {
    return viewMatchesObjectFilter({
      src,
      filters: filterValues ?? [],
      sourceMode: this.config?.source_mode ?? "sensor",
      getSrcEntity: (s) => this._sensorClient.getSrcEntityMap().get(s),
      getSensorState: (entityId) => this._hass?.states?.[entityId],
      getObjectForSrc: (s) => this._objectForSrc(s),
    });
  }

  _objectForSrc(src) {
    const key = String(src || "").trim();
    if (!key) return null;
    if (this._objectCache.has(key)) return this._objectCache.get(key);

    const detected = detectObjectForSrc({
      src: key,
      sourceMode: this.config?.source_mode ?? "sensor",
      visibleFilters: this._getVisibleObjectFilters(),
      getSrcEntity: (s) => this._sensorClient.getSrcEntityMap().get(s),
      getSensorState: (entityId) => this._hass?.states?.[entityId],
      getMediaTitle: (s) => this._mediaClient.getMetaById(s)?.title,
    });
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

    // Pre-toggle slice — the pipeline's cached base list reflects the
    // current `_objectFilters`. We need the selected src under the current
    // filter set to figure out where it lands after the toggle.
    const base = this._pipeline.getBaseList();
    const currentFiltered = base.dayFiltered.filter((x) =>
      this._matchesObjectFilterValue(x.src, currentFilters)
    );

    const currentIdx = Math.min(
      Math.max(this._selectedIndex ?? 0, 0),
      Math.max(0, currentFiltered.length - 1)
    );

    const currentSelectedSrc =
      currentFiltered.length > 0 ? currentFiltered[currentIdx]?.src : "";

    const nextFiltered = base.dayFiltered.filter((x) =>
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
    if (!this.config?.allow_bulk_delete) return;

    const srcs = Array.from(selectedSrcList || []);
    if (!srcs.length) return;

    if (this.config?.delete_confirm) {
      const ok = window.confirm(
        `Are you sure you want to delete ${srcs.length} item(s)?`
      );
      if (!ok) return;
    }

    // Route every item through the same deleteItem() helper as single
    // delete — picks sensor or Frigate dispatch per item, validates path
    // prefixes, surfaces errors. `confirm: () => true` suppresses the
    // per-item dialog since we already confirmed the batch above.
    const srcEntityMap = this._sensorClient.getSrcEntityMap();
    let okCount = 0;
    const failed = [];

    for (const src of srcs) {
      const ok = await deleteItem({
        hass: this._hass,
        src,
        config: this.config,
        srcEntityMap,
        confirm: () => true,
      });
      if (ok) {
        okCount++;
        this._deleted.add(src);
        const eventId = frigateEventIdFromSrc(src);
        if (eventId) this._deletedFrigateEventIds.add(eventId);
      } else {
        failed.push(src);
      }
    }

    this._invalidateItems();
    this._selectedSet.clear();
    this._selectMode = false;
    this._hideBulkDeleteHint();
    this.requestUpdate();

    if (failed.length > 0) {
      this._showErrorToast(
        "Some deletes failed",
        okCount > 0
          ? `Deleted ${okCount} of ${srcs.length}. ${failed.length} failed — check delete_service / frigate_delete_service config.`
          : `Could not delete ${failed.length} item(s). Check delete_service / frigate_delete_service config.`
      );
    }
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
    const next = nextInList(this._selectedIndex, listLen);
    if (next === null) return;
    this._resetZoom();
    this._selectedIndex = next;
    this._pendingScrollToI = this._selectedIndex;
    this.requestUpdate();
    this._showNavChevrons();
    this._showPills();
  }

  _navPrev() {
    if (this._selectMode || this._isLiveActive()) return;
    const prev = prevInList(this._selectedIndex);
    if (prev === null) return;
    this._resetZoom();
    this._selectedIndex = prev;
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
    this._posterClient.load(this.config);
    // Re-derive mic audio constraints + ICE config; takes effect on the
    // next start(). If the user un-set the mic stream for the currently
    // active camera (or cleared the legacy `live_go2rtc_stream` with no
    // map fallback) the pill goes away — stop the mic if it was running
    // so we don't keep an orphan PC alive on a camera that no longer
    // surfaces a mic UI.
    const micAp = this._micAudioProcessingFromConfig();
    if (micAp) this._micClient.setAudioProcessing(micAp);
    this._micClient.setIceConfig({
      iceServers: this._micIceServersFromConfig() ?? null,
      iceTransportPolicy: nextConfig.live_mic_force_relay ? "relay" : "all",
    });
    if (this._micState !== "idle") {
      const activeCam = this._getEffectiveLiveCamera();
      if (!micStreamForCamera(activeCam, nextConfig)) this._micClient.stop();
    }
    this._startMediaPoll();

    // Prewarm the IDB-backed poster mirror once. `prewarm()` is idempotent;
    // the client coalesces concurrent calls into a single shared promise.
    if (!prevConfig) void this._posterClient.prewarm();

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
      this._invalidateItems();
      this._closeThumbMenu();
      this._forceThumbReset = false;
      this._pendingScrollToI = 0;
      this._previewOpen = !this.config.clean_mode;
      this._selectMode = false;
      this._selectedIndex = 0;
      this._selectedSet.clear();
      this._hideBulkDeleteHint();
      this._posterClient.clearPosterCache();
      this._objectCache.clear();
    }

    const liveCameraConfigChanged = changedKeys.some((k) =>
      ["live_camera_entity", "live_enabled"].includes(k)
    );

    if (liveCameraConfigChanged) {
      this._hideLiveQuickSwitchButton();
      this._teardownLiveView();
      this._signedWsPath = null;
    }

    if (!this._hasLiveConfig()) {
      this._hideLiveQuickSwitchButton();
      this._showLivePicker = false;
      if (this._viewMode === "live") this._teardownLiveView();
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

    // Lazy-load the active day for media/combined modes. The MediaSourceClient
    // returns immediately when the day is already cached, so this is cheap.
    // Also prefetch the adjacent days so left/right arrow navigation feels
    // instant.
    if (dayChanged || changedProps.has("config")) {
      const mode = this.config?.source_mode;
      if (mode === "media" || mode === "combined") {
        const activeDay = this._selectedDay;
        const days = this._mediaClient.getDays?.() || [];
        const ensure = (d) => {
          if (d) void this._mediaClient.ensureDayLoaded?.(d);
        };
        if (activeDay) ensure(activeDay);
        if (activeDay && days.length) {
          const i = days.indexOf(activeDay);
          if (i >= 0) {
            ensure(days[i - 1]); // newer
            ensure(days[i + 1]); // older
          }
        } else if (days.length) {
          // No selection yet — load the newest day so first paint isn't empty.
          ensure(days[0]);
        }
      }
    }

    if (changedProps.has("config")) {
      // Sync runtime gallery mute with config default whenever config
      // changes — the pill toggle then overrides for this session.
      this._galleryMuted =
        this.config?.auto_muted !== undefined
          ? this.config.auto_muted === true
          : true;
      if (this._previewVideoEl) {
        this._previewVideoEl.autoplay = this.config?.autoplay === true;
        this._previewVideoEl.muted = this._galleryMuted;
      }
    }

    const usingMediaSource = this.config?.source_mode === "media" || this.config?.source_mode === "combined";
    const base = this._computeBaseList();

    if (base.rawItems.length) {
      const filteredAll = base.objFiltered;

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

      // Skip the per-cycle poster scheduling when nothing observable
      // changed since the last `updated()` — both methods are internally
      // idempotent, but iterating up to ~50 items per hass push when
      // the slice is the same is wasted CPU. Gate on items rev + the
      // composition keys that drive `_computeBaseList`.
      const queueKey = `${this._pipeline.rev}|${this._selectedDay}|${this._selectedIndex}`;
      if (queueKey !== this._lastPosterQueueKey) {
        this._lastPosterQueueKey = queueKey;
        this._queueSnapshotResolveForVisibleThumbs(visibleThumbSlice);
        this._queueSensorPosterWork(posterWorkSlice);
      }
    }

    // Drain the pending work `client.resolveVideoPoster` collected during
    // render(). Batch dispatch runs after the DOM commit, so any
    // `requestUpdate` triggered by the queue draining doesn't re-enter
    // the current render cycle. The collector also carries (url, stableKey)
    // tuples for media-source items whose resolved URL rotates each session.
    if (this._pendingPoster) {
      if (this._pendingPoster.resolveIds.size) {
        this._mediaClient.queueResolve([...this._pendingPoster.resolveIds]);
      }
      for (const { url, stableKey } of this._pendingPoster.posters) {
        this._posterClient.enqueue(url, stableKey);
      }
      this._pendingPoster = null;
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
          const isSensor = this.config?.source_mode === "sensor" || this.config?.source_mode === "combined";
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const key = entry.target.dataset.lazySrc;
              if (key && !this._revealedThumbs.has(key)) {
                this._revealedThumbs.add(key);
                changed = true;
              }
              // Viewport-aware enqueue: only the cheap server-side
              // thumbnail (paired jpg). Raw video capture is deferred
              // until the user clicks the item — see the click-path
              // in `_ensurePreviewVideoHostPlayback`.
              if (isSensor && key && isVideo(key)) {
                const pairedJpg = this._sensorClient.getSensorPairedThumbs().get(key);
                if (pairedJpg) this._posterClient.enqueue(pairedJpg);
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

    // Per-render pending-work collector. `client.resolveVideoPoster` pushes
    // (url, stableKey?) tuples and snapshot mediaIds into this instead of
    // side-effecting the client mid-render; `updated()` drains it after the
    // DOM is committed.
    this._pendingPoster = new PendingPosterCollector();

    const usingMediaSource = this.config?.source_mode === "media" || this.config?.source_mode === "combined";
    const thumbRatio = "1 / 1";
    const base = this._computeBaseList();
    const rawItems = base.rawItems;
    const visibleObjectFilters = this._getVisibleObjectFilters();

    if (!rawItems.length) {
      if (usingMediaSource && this._mediaClient.isLoading()) {
        return html`<div class="empty">Loading media…</div>`;
      }
      return html`<div class="empty">No media found.</div>`;
    }

    const { days, newestDay, activeDay, objFiltered, videoCount, imageCount } = base;

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
    const fsp = parseServiceParts(this.config?.frigate_delete_service);

    const canDelete = !!sp || !!fsp;
    const canBulkDelete =
      !!this.config?.allow_bulk_delete &&
      (!!sp || !!fsp);

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
      --cgc-card-radius:10px;
      --cgc-bar-opacity:${this.config.bar_opacity};
      --cgc-thumb-row-h:${this.config.thumb_size}px;
      --cgc-thumb-empty-h:${this.config.thumb_size}px;
      --cgc-topbar-margin:${STYLE.topbar_margin};
      --cgc-topbar-padding:${STYLE.topbar_padding};
      --cgc-thumbs-max-h:${(this.config.card_height ?? 0) > 0 ? this.config.card_height + "px" : "320px"};
      --cgc-object-fit:${this.config.object_fit || "cover"};
      --cgc-pill-size:${this.config.pill_size}px;
      --cgc-row-gap:${this.config.row_gap}px;
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
        ${selectedIsVideo ? html`
          <button class="gallery-pill live-pill-btn" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._toggleGalleryMute(); }}>
            <ha-icon icon=${this._galleryMuted ? "mdi:volume-off" : "mdi:volume-high"}></ha-icon>
          </button>
        ` : html``}
      </div>
    `;
    const galleryPillsRight = html`
      <div class="gallery-pills-right">
        ${selectedHasUrl && !noResultsForFilter ? html`
          <button class="gallery-pill live-pill-btn" style="flex-shrink:0;width:calc(var(--cgc-pill-size,14px)*1.6 + 2px);height:calc(var(--cgc-pill-size,14px)*1.6 + 2px);padding:0" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._openImageFullscreen(); }}>
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
        ${this.config?.live_layout === "grid" && this._liveLayoutOverride === "single" ? html`
          <button class="gallery-pill live-pill-btn" title="Back to grid" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._returnToGrid(); }}>
            <ha-icon icon="mdi:view-grid"></ha-icon>
          </button>
        ` : html``}
        ${this.config?.debug_enabled ? html`
          <button class="gallery-pill live-pill-btn" title="Diagnostics" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._openDebug(); }}>
            <ha-icon icon="mdi:bug-outline"></ha-icon>
          </button>
        ` : html``}
        <button class="gallery-pill live-pill-btn" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._toggleLiveMute(); }}>
          <ha-icon icon=${this._liveMuted ? "mdi:volume-off" : "mdi:volume-high"}></ha-icon>
        </button>
        ${this._renderMicPill()}
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
                  ? html`<div class="preview-skeleton" aria-hidden="true"></div>`
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

            ${isLive && !isGridLayout(this.config, this._liveLayoutOverride) && this._getLiveCameraOptions().length > 1 && (this._pillsVisible || this.config?.persistent_controls) ? html`
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
            ${isLive && !isGridLayout(this.config, this._liveLayoutOverride) && !fixedMode ? html`
              <div class="live-controls-bar ${tsPosClass} ${this._pillsVisible || this._showLivePicker || this.config?.persistent_controls ? "visible" : ""}">
                <div class="live-controls-main">
                  ${livePillsLeft}${livePillsRight}
                </div>
                ${this._renderMicErrorToast()}
              </div>
            ` : html``}
            ${isLive && !isGridLayout(this.config, this._liveLayoutOverride) ? hamburgerPanel : html``}
          </div>
        `
      : html``;

    const controlsFixedBlock = fixedMode && showPreviewSection ? html`
      <div class="controls-bar-fixed">
        ${isLive && !isGridLayout(this.config, this._liveLayoutOverride) ? html`
          <div class="live-controls-main live-controls-main--fixed">
            ${livePillsLeft}${livePillsRight}
          </div>
        ` : tsPosClass !== "hidden" && !isLive ? html`
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
                  style="--cgc-thumb-gap:${THUMB_GAP}px;"
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
                      ? this._posterClient.resolveVideoPoster(it, isMs, thumbUrl, tThumb, this._pendingPoster)
                      : thumbUrl;
                    // For unresolved MS images, use the browse_media thumbnail as fallback
                    // so the thumbnail appears immediately while the full URL is still resolving
                    if (!isVid && !poster && isMs && tThumb) {
                      poster = this._posterClient.getPosterUrl(tThumb) || "";
                      if (!poster) this._posterClient.enqueue(tThumb);
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
                        class="tthumb ${isOn ? "on" : ""} ${this._selectMode && isSel ? "sel" : ""} bar-${barPos} ${showBar ? "with-bar" : ""}"
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
                              @error=${() => this._posterClient.onThumbImgError(poster)}
                            />`
                          : this._posterClient.isThumbBroken(it, isMs, thumbUrl, tThumb)
                            ? html`<div class="tph broken" aria-hidden="true">
                                <ha-icon icon="mdi:image-broken-variant"></ha-icon>
                              </div>`
                            : isVid && this._posterClient.isPrewarmDone() && this._posterClient.willNeverLoad(it, isMs, tThumb)
                              ? html`<div class="tph disabled" aria-hidden="true" title="Thumbnail capture is off">
                                  <ha-icon icon="mdi:cloud-off-outline"></ha-icon>
                                </div>`
                              : this._posterClient.isPosterLoading(it, isMs, thumbUrl, tThumb)
                                ? html`<div class="tph spinner" aria-hidden="true"></div>`
                                : html`<div class="tph skeleton" aria-hidden="true"></div>`}

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
                          ? html`<div class="selOverlay ${isSel ? "on" : ""}"></div>`
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

        ${this._errorToast
          ? html`
              <div
                class="cgc-error-toast"
                @click=${() => this._dismissErrorToast()}
                role="alert"
              >
                <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
                <div class="cgc-error-toast-text">
                  <div class="cgc-error-toast-title">${this._errorToast.title}</div>
                  <div class="cgc-error-toast-msg">${this._errorToast.message}</div>
                </div>
              </div>
            `
          : html``}

        ${this._renderDatePicker()}

        ${this._renderThumbActionSheet()}

        ${this._renderDebugModal()}

        ${this._imgFsOpen && selectedUrl ? html`
          <div class="img-fs-overlay" @click=${() => this._closeImageFullscreen()}>
            ${selectedIsVideo
              ? html`<video src=${selectedUrl} controls autoplay playsinline ?muted=${this._galleryMuted} @click=${(e) => e.stopPropagation()}></video>`
              : html`<img src=${selectedUrl} alt="" @click=${(e) => e.stopPropagation()} />`}
            ${filtered.length > 1 ? html`
              <div class="pnav img-fs-nav">
                <button class="pnavbtn left" ?disabled=${idx <= 0} @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._navImgFs(-1, filtered.length); }}>
                  <ha-icon icon="mdi:chevron-left"></ha-icon>
                </button>
                <button class="pnavbtn right" ?disabled=${idx >= filtered.length - 1} @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._navImgFs(1, filtered.length); }}>
                  <ha-icon icon="mdi:chevron-right"></ha-icon>
                </button>
              </div>
            ` : html``}
            <button class="img-fs-close" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._closeImageFullscreen(); }}>
              <ha-icon icon="mdi:fullscreen-exit"></ha-icon>
            </button>
          </div>
        ` : html``}

      </div>
    `;
  }

  static get styles() {
    return cardStyles;
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
  'mdi:format-line-spacing': 'M10,5V19H13V17H11V7H13V5H10M14,7V9H21V7H14M14,11V13H21V11H14M14,15V17H21V15H14M6,7L2,11H5V13H2L6,17V13H9V11H6V7Z',
};

function svgIcon(icon, size = 18) {
  const path = CGC_ICONS[icon] || '';
  return `<svg class="cgc-svg-icon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" style="fill:currentColor;flex-shrink:0;display:block"><path d="${path}"/></svg>`;
}


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
          // `noUncheckedIndexedAccess`-safe — an empty `{}` would otherwise
          // throw on `.toLowerCase()`. The `if (!key …)` below drops it.
          key = (Object.keys(item)[0] || "").toLowerCase().trim();
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
        this._config = this._stripAlwaysTrueKeys(next);
        this._fire();
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
    const liveLayout = c.live_layout === "grid" ? "grid" : "single";
    const liveGridLabels = c.live_grid_labels !== false;
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
                <div class="lbl">Path datetime format</div>
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

              <div class="row">
                <div class="lbl">Delete services</div>
                <div style="padding-top:8px;display:flex;flex-direction:column;gap:14px;">
                  <div class="${mediaModeOn ? "row-disabled" : ""}">
                    <div class="lbl">Sensor</div>
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
                  <div>
                    <div class="lbl">Frigate</div>
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
                </div>
              </div>

              <div class="row">
                <div class="row-head">
                  <div>
                    <div class="lbl">Debug mode</div>
                    <div class="desc">Show a debug pill in live view that opens a diagnostics report (card version, HA info, runtime state). Useful for support questions.</div>
                  </div>
                  <div class="togrow">
                    <label class="cgc-switch"><input type="checkbox" id="debug-enabled" ${this._config?.debug_enabled ? "checked" : ""}><span class="cgc-track"></span></label>
                  </div>
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

                ${liveCameraEntities.length > 1 ? `
                <div class="row">
                  <div class="lbl">Live layout</div>
                  <div class="desc">Single shows one camera at a time (use the picker to switch). Grid shows all visible cameras at once — tap a tile to focus.</div>
                  <div class="segwrap">
                    <button class="seg ${liveLayout === "single" ? "on" : ""}" data-livelayout="single">Single</button>
                    <button class="seg ${liveLayout === "grid" ? "on" : ""}" data-livelayout="grid">Grid</button>
                  </div>
                  ${liveLayout === "grid" ? `
                  <div class="row-inline live-grid-suboption">
                    <span>Show camera labels</span>
                    <label class="cgc-switch"><input type="checkbox" id="live-grid-labels" ${liveGridLabels ? "checked" : ""}><span class="cgc-track"></span></label>
                  </div>
                  ` : ``}
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
                  <div class="lbl">Two-way audio</div>
                  <div class="desc">Talk back to a camera's speaker from live view. For each camera below, enter its go2rtc stream name — the key under <code>streams:</code> in your <code>go2rtc.yaml</code>. Leave blank to hide the mic for that camera.</div>
                  <div class="desc" style="margin-top:4px;font-size:0.78em;opacity:0.7;">Needs: <a href="https://github.com/AlexxIT/WebRTC" target="_blank" rel="noopener">WebRTC Camera</a> HACS integration · camera with audio backchannel · HTTPS or localhost.</div>
                  ${(() => {
                    const comps = this._hass?.config?.components;
                    const hasWebrtc = Array.isArray(comps) && comps.includes("webrtc");
                    if (hasWebrtc) return ``;
                    return `<div class="cgc-inline-warn">${svgIcon('mdi:alert-outline', 14)}<span>WebRTC Camera integration not detected — install it via HACS for the mic to work.</span></div>`;
                  })()}
                  ${(() => {
                    // Build the row list: each HA entity + each stream URL the
                    // user has added to the picker. The mic pill keys off the
                    // currently-active camera (entity id or synthetic stream
                    // id), so the editor rows match those keys 1:1.
                    const micMap = (this._config.live_mic_streams && typeof this._config.live_mic_streams === "object")
                      ? this._config.live_mic_streams
                      : {};
                    const streamEntries = getStreamEntries(this._config);
                    const rows = [];
                    streamEntries.forEach((se) => {
                      rows.push({
                        id: se.id,
                        kind: "stream",
                        label: se.name || "Stream",
                        sub: "stream url",
                        value: String(micMap[se.id] ?? "").trim(),
                      });
                    });
                    liveCameraEntities.forEach((entId) => {
                      const friendly = String(this._hass?.states?.[entId]?.attributes?.friendly_name || entId).trim();
                      rows.push({
                        id: entId,
                        kind: "entity",
                        label: friendly,
                        sub: entId,
                        value: String(micMap[entId] ?? "").trim(),
                      });
                    });
                    if (rows.length === 0) {
                      return `<div class="desc" style="font-style:italic;opacity:0.7;">Add at least one camera (entity or stream URL) above to configure mic backchannels.</div>`;
                    }
                    return `<div class="mic-stream-list" style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
                      ${rows.map((r) => `
                        <div class="mic-stream-row" style="display:flex;gap:8px;align-items:center;padding:6px 8px;border:1px solid var(--ed-input-border);border-radius:var(--ed-radius-input,8px);">
                          <div style="flex:1;min-width:0;">
                            <div style="font-weight:500;">${r.label.replace(/</g,"&lt;")}</div>
                            <div style="font-size:0.72em;opacity:0.6;">${r.sub.replace(/</g,"&lt;")}</div>
                          </div>
                          <input type="text" class="ed-input mic-stream-input" data-mic-cam="${r.id.replace(/"/g,"&quot;")}" value="${r.value.replace(/"/g,"&quot;")}" placeholder="go2rtc stream name (empty = no mic)" autocomplete="off" style="flex:0 0 240px;" />
                        </div>
                      `).join("")}
                    </div>`;
                  })()}
                  ${(() => {
                    // Legacy single-stream fallback. Show a hint so users
                    // know it still works but the map is the new way.
                    const legacy = String(this._config.live_go2rtc_stream ?? "").trim();
                    if (!legacy) return ``;
                    return `<div class="desc" style="margin-top:8px;">
                      <strong>Legacy single-stream config detected:</strong> <code>live_go2rtc_stream: ${legacy.replace(/</g,"&lt;")}</code> is set in your YAML. It still works (applies to whichever camera is active) and you don't need to change anything. Filling in any row above will switch to the per-camera map — once you do, the legacy key is ignored.
                    </div>`;
                  })()}
                  ${hasAnyMicStream(this._config) ? `
                  <div class="row-inline" style="margin-top:8px;">
                    <span>Interaction</span>
                    <div class="segwrap" style="margin-left:auto;">
                      <button class="seg ${(this._config.live_mic_mode || "toggle") === "toggle" ? "on" : ""}" data-livemicmode="toggle">Toggle</button>
                      <button class="seg ${this._config.live_mic_mode === "ptt" ? "on" : ""}" data-livemicmode="ptt">Push-to-talk</button>
                    </div>
                  </div>
                  <div class="desc" style="margin-top:6px;">Audio processing</div>
                  ${(() => {
                    const ap = this._config.live_mic_audio_processing || {};
                    const ec = ap.echo_cancellation !== false;
                    const ns = ap.noise_suppression !== false;
                    const agc = ap.auto_gain_control !== false;
                    return `
                    <div class="row-inline"><span>Echo cancellation</span><label class="cgc-switch"><input type="checkbox" id="live-mic-ec" ${ec ? "checked" : ""}><span class="cgc-track"></span></label></div>
                    <div class="row-inline"><span>Noise suppression</span><label class="cgc-switch"><input type="checkbox" id="live-mic-ns" ${ns ? "checked" : ""}><span class="cgc-track"></span></label></div>
                    <div class="row-inline"><span>Auto gain control</span><label class="cgc-switch"><input type="checkbox" id="live-mic-agc" ${agc ? "checked" : ""}><span class="cgc-track"></span></label></div>`;
                  })()}
                  ` : ``}
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
                <div class="segwrap">
                  <button class="seg ${thumbSortOrder === "newest" ? "on" : ""}" data-tsort="newest">Newest first</button>
                  <button class="seg ${thumbSortOrder === "oldest" ? "on" : ""}" data-tsort="oldest">Oldest first</button>
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

        .live-grid-suboption {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--ed-divider, rgba(255, 255, 255, 0.08));
          font-size: 13px;
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

        .radius-value-wrap {
          display: inline-flex;
          align-items: baseline;
          gap: 2px;
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

    const frigateDelserviceEl = $("frigate-delservice");
    const commitFrigateDeleteService = () => {
      const v = String(frigateDelserviceEl?.value || "").trim();
      if (!v) {
        const next = { ...this._config };
        delete next.frigate_delete_service;
        this._config = this._stripAlwaysTrueKeys(next);
        this._fire();
        this._scheduleRender();
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

    $("capture-video-thumbnails")?.addEventListener("change", (e) => {
      this._set("capture_video_thumbnails", !!e.target.checked);
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

    $("live_go2rtc_url")?.addEventListener("change", (e) => {
      const val = String(e.target.value || "").trim();
      if (val) this._set("live_go2rtc_url", val);
      else { const n = { ...this._config }; delete n.live_go2rtc_url; this._config = this._stripAlwaysTrueKeys(n); this._fire(); }
    });

    // Per-camera mic backchannel map: each row writes/clears one key in
    // `live_mic_streams`. When the map becomes empty, drop the key
    // entirely to keep YAML output minimal.
    root.querySelectorAll(".mic-stream-input").forEach((inp) => {
      inp.addEventListener("change", (e) => {
        const cam = String(inp.dataset.micCam || "").trim();
        if (!cam) return;
        const val = String(e.target.value || "").trim();
        const n = { ...this._config };
        const map = { ...(n.live_mic_streams && typeof n.live_mic_streams === "object" ? n.live_mic_streams : {}) };
        if (val) map[cam] = val;
        else delete map[cam];
        if (Object.keys(map).length > 0) n.live_mic_streams = map;
        else delete n.live_mic_streams;
        this._config = this._stripAlwaysTrueKeys(n);
        this._fire();
      });
    });

    // Mic interaction mode (toggle vs push-to-talk). Default "toggle"
    // is the only value not stored — keeps the YAML output minimal.
    root.querySelectorAll("[data-livemicmode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.livemicmode;
        if (mode === "ptt") {
          this._set("live_mic_mode", "ptt");
        } else {
          const n = { ...this._config };
          delete n.live_mic_mode;
          this._config = this._stripAlwaysTrueKeys(n);
          this._fire();
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
      this._config = this._stripAlwaysTrueKeys(n);
      this._fire();
    };
    $("live-mic-ec")?.addEventListener("change", (e) => _setMicAp("echo_cancellation", !!e.target.checked));
    $("live-mic-ns")?.addEventListener("change", (e) => _setMicAp("noise_suppression", !!e.target.checked));
    $("live-mic-agc")?.addEventListener("change", (e) => _setMicAp("auto_gain_control", !!e.target.checked));

    $("frigate_url")?.addEventListener("change", (e) => {
      const val = String(e.target.value || "").trim().replace(/\/+$/, "");
      if (val) this._set("frigate_url", val);
      else { const n = { ...this._config }; delete n.frigate_url; this._config = this._stripAlwaysTrueKeys(n); this._fire(); }
    });

    $("debug-enabled")?.addEventListener("change", (e) => {
      const on = !!e.target.checked;
      if (on) {
        this._set("debug_enabled", true);
      } else {
        const next = { ...this._config };
        delete next.debug_enabled;
        this._config = this._stripAlwaysTrueKeys(next);
        this._fire();
      }
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

    this.shadowRoot.querySelectorAll(".seg[data-livelayout]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.livelayout === "grid" ? "grid" : "single";
        if (val === "single") {
          // Default — drop the key from YAML so the config stays minimal.
          const next = { ...this._config };
          delete next.live_layout;
          this._config = this._stripAlwaysTrueKeys(next);
          this._fire();
        } else {
          this._set("live_layout", val);
        }
        btn.closest(".segwrap")?.querySelectorAll(".seg").forEach((s) => s.classList.toggle("on", s === btn));
      });
    });

    $("live-grid-labels")?.addEventListener("change", (e) => {
      const on = !!e.target.checked;
      if (on) {
        // Default — drop the key from YAML.
        const next = { ...this._config };
        delete next.live_grid_labels;
        this._config = this._stripAlwaysTrueKeys(next);
        this._fire();
      } else {
        this._set("live_grid_labels", false);
      }
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
    const RENDERS_REQUIRED = new Set(["source_mode", "live_enabled", "live_camera_entities", "object_filters", "delete_service", "frigate_delete_service", "live_camera_entity", "menu_buttons", "frigate_url", "live_layout"]);
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
