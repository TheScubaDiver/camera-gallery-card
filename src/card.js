/**
 * Camera Gallery Card — the card element (camera-gallery-card).
 * The visual editor lives in ./editor/editor.js.
 */

import { LitElement, html } from "lit";
import { cardStyles } from "./styles";
import { injectLiveFillStyle } from "./ui/live-fill-style";
import { dayKeyFromMs, dtKeyFromMs } from "./data/datetime-parsing";
import { configDiff } from "./config/diff";
import { normalizeConfig } from "./config/normalize";
import {
  filterLabel,
  filterLabelList,
  objectColor,
  objectIcon,
} from "./data/object-filters";
import { FavoritesStore } from "./data/favorites";
import { parseServiceParts, SensorSourceClient } from "./data/sensor-source";
import { isMediaSourceId, keyFromRoots as msKeyFromRoots, MediaSourceClient } from "./data/media-walker";
import { isReolinkRoot } from "./data/reolink-engine";
import { REOLINK_LOGO_DATA_URL } from "./assets/reolink-logo";
import { CombinedSourceClient } from "./data/combined-source";
import { canDeleteItem, deleteItem } from "./data/delete-service";
import { nativeTalkShouldToggle, nativeTalkUiState, talkSource } from "./data/native-talk";
import { CARD_GRID_OPTIONS, CARD_LAYOUT_OPTIONS, cardEntitySuggestion } from "./data/card-registration";
import {
  isMenuButtonOn,
  menuButtonLabel,
  menuButtonTap,
  selectOptionCall,
} from "./data/menu-buttons";
import { filenameFromUrl, resolveDownloadTarget } from "./data/download-target";
import { galleryState, SKELETON_THUMB_COUNT } from "./data/gallery-state";
import { buildThumbActionCall, thumbActionConfirmText, thumbActionContext } from "./data/thumb-actions";
import { PendingPosterCollector, PosterCacheClient } from "./data/poster-cache";
import { ItemPipelineClient } from "./data/item-pipeline";
import { parseUrlActions } from "./data/url-actions";
import {
  detectObjectsForSrc,
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
  getLiveCameraEntityIds,
  getLiveCameraOptions,
  getStreamEntries,
  getStreamEntryById,
  getTriggerCameras,
  gridLayout,
  hasAnyMicStream,
  hasLiveConfig,
  isGridLayout,
  liveCameraEntry,
  liveCameraRotation,
  micStreamForCamera,
} from "./data/live-config";
import {
  isQuarterTurn,
  rotatedAspect,
  rotationStyle,
  screenToLocal,
  snapshotGeometry,
} from "./data/live-rotation";
import {
  GALLERY_PILL_CATALOG,
  TOOLBAR_CATALOG,
  resolvePillSettings,
  sortPillsByOrder,
} from "./data/pill-catalog";
import { MIC_NOTIFICATION_ID, WebRtcMicClient } from "./data/webrtc-mic";
import { syncLiveAudio } from "./data/live-audio";
import { mediaAspect } from "./data/live-aspect";
import { liveControlZones } from "./data/live-controls-layout";
import { isTalkbackRow, talkbackPosition, talkbackRowJustify } from "./data/talkback-layout";
import { StreamWatchdog } from "./data/stream-watchdog";
import {
  buildTriggerMap,
  frigateEventCamera,
  isTriggerActivation,
  LiveTriggerController,
} from "./data/live-triggers";
import {
  armWebkitExitResume,
  captureHandoff,
  galleryFullscreenTarget,
  handoffStartTime,
  sameMediaUrl,
  liveFullscreenTarget,
  shouldResumeAfterExit,
} from "./data/video-fullscreen";
import {
  dispatchAction as ptzDispatchAction,
  dispatchPan as ptzDispatchPan,
  getPtzConfig,
  joystickResolve,
  ptzCapabilities,
  resolvePtzPosition,
} from "./data/ptz";
import { buildDiagnostics, diagnosticsToText } from "./data/diagnostics";
import { frigateEventIdFromSrc, hasFrigateConfig, isFrigateRoot } from "./util/frigate";
import {
  formatDateTime,
  formatDay,
  formatDayNumeric,
  formatMonth,
  formatTimeFromMs,
  resolveLocale,
} from "./util/locale";
import {
  DEFAULT_MAX_MEDIA,
  PTZ_SPEED_MAX,
  DEFAULT_THUMBNAIL_FRAME_PCT,
  DEFAULT_VISIBLE_OBJECT_FILTERS,
  PREVIEW_WIDTH,
  STYLE,
  THUMB_GAP,
  THUMB_LONG_PRESS_MOVE_PX,
  THUMB_LONG_PRESS_MS,
  THUMB_SWIPE_COMMIT,
  THUMB_SWIPE_MAX,
  THUMB_RADIUS,
  THUMBS_ENABLED,
} from "./const";


// Replaced at build time by @rollup/plugin-replace from package.json `version`.
/* global __VERSION__ */
const CARD_VERSION = __VERSION__;

/* ───────────────────────── Talkback waveform renderer ─────────────────────
 * Bars-only frequency visualiser drawn on a canvas overlay inside the
 * talkback bar while the mic is `active`. Pure module-level helpers so
 * the rendering is testable without a Card instance.
 *
 * opts shape:
 *   sensitivity  — 'low' | 'medium' | 'high' (maps to gain)
 *   freqBuf      — pre-allocated Uint8Array buffer
 *   getFreq(buf) — filler that populates the buffer in place
 */

/** Gain factor fed into the tanh soft-clip; higher = more visible reaction
 *  to quiet input. Three presets cover the practical range. */
const WF_GAIN = { low: 2.0, medium: 3.5, high: 5.5 };
/** Hard-coded global opacity of the rendered bars (0..1). Lab-tested value
 *  that reads well over the standard talkback bar tint. */
const WF_OPACITY = 0.35;

/** Format a seconds count as `M:SS` (or `H:MM:SS` past an hour). Used by
 *  the gallery time-pill. NaN / negative input returns `0:00`. */
function formatVideoTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s < 10 ? `0${s}` : `${s}`;
  if (h > 0) {
    const mm = m < 10 ? `0${m}` : `${m}`;
    return `${h}:${mm}:${ss}`;
  }
  return `${m}:${ss}`;
}

/** Render 48 frequency bars across the canvas. A linear tilt boosts higher
 *  bins so the spectrum doesn't look lopsided left-to-right (speech naturally
 *  rolls off above ~3 kHz). */
function wfDrawBars(ctx, w, h, shape, buf) {
  const visible = 48;
  const gap = 2;
  const bw = (w - gap * (visible - 1)) / visible;
  for (let i = 0; i < visible; i++) {
    const tilt = 1 + (i / visible) * 1.2;
    const v = shape((buf[i] / 255) * tilt);
    const barH = Math.max(2, v * h * 0.95);
    const grad = ctx.createLinearGradient(0, h - barH, 0, h);
    grad.addColorStop(0, `rgba(255,255,255,${0.55 * WF_OPACITY})`);
    grad.addColorStop(1, `rgba(255,255,255,${0.15 * WF_OPACITY})`);
    ctx.fillStyle = grad;
    ctx.fillRect(i * (bw + gap), h - barH, bw, barH);
  }
}

function wfDrawFrame(canvas, opts) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  if (
    canvas.width !== Math.round(rect.width * dpr) ||
    canvas.height !== Math.round(rect.height * dpr)
  ) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const gain = WF_GAIN[opts.sensitivity] ?? WF_GAIN.medium;
  const shape = (v) => Math.tanh(v * gain);

  if (!opts.getFreq(opts.freqBuf)) return;
  wfDrawBars(ctx, rect.width, rect.height, shape, opts.freqBuf);
}

// Joystick geometry — used in render and in the keyboard handler that
// animates the thumb to the rim on arrow-key press for visual feedback.
const PTZ_JOY_BASE_SIZE = 76;
const PTZ_JOY_THUMB_SIZE = 30;
const PTZ_JOY_MAX_OFFSET = (PTZ_JOY_BASE_SIZE - PTZ_JOY_THUMB_SIZE) / 2;

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
      _streamLost: { type: Boolean },
      _suppressNextThumbClick: { type: Boolean },
      _swipeStartX: { type: Number },
      _swipeStartY: { type: Number },
      _swipeCurX: { type: Number },
      _swipeCurY: { type: Number },
      _swiping: { type: Boolean },
      _thumbMenuItem: { type: Object },
      _thumbMenuOpen: { type: Boolean },
      _viewMode: { type: String }, // "media" | "live" | "hybrid"
      _hybridDrawerOpen: { type: Boolean }, // drawer slide-in state
      _hybridClipOpen: { type: Boolean }, // playing a clip in-place over live
      _hybridDayMenuOpen: { type: Boolean }, // drawer day dropdown open
      _hybridDrawerWidthPct: { type: Number }, // user-resizable drawer width (%)
      _hybridLayout: { type: String }, // drawer clip layout: "grid" | "list"
      _liveMuted: { type: Boolean },
      _liveFullscreen: { type: Boolean },
      _livePipActive: { type: Boolean },
      _galleryPipActive: { type: Boolean },
      _galleryPlaying: { type: Boolean },
      _galleryCurrentTime: { type: Number },
      _galleryDuration: { type: Number },
      _galleryAutoplayAll: { type: Boolean },
      _galleryPlaybackSpeed: { type: Number },
      _imgFsOpen: { type: Boolean },
      _aspectRatio: { type: String },
      _micState: { type: String },
      _micErrorCode: { type: String },
      _scrollPillText: { type: String },
      _scrollPillVisible: { type: Boolean },
      _hamburgerOpen: { type: Boolean },
      _filterVideo: { type: Boolean },
      _filterImage: { type: Boolean },
      _filterFavorites: { type: Boolean },
      _ptzActive: { type: Boolean },
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
      live_cameras: cameraEntity ? [{ entity: cameraEntity, name: "" }] : [],
      thumb_size: 140,
      bar_position: "top",
      object_filters: DEFAULT_VISIBLE_OBJECT_FILTERS,
    };
  }

  constructor() {
    super();

    this._previewMediaKey = "";
    this._previewVideoEl = null;
    this._videoFsWasPlaying = false;
    this._videoLastPauseAt = null;
    this._imgFsHandoff = null;
    this._prefetchKey = "";
    this._deleted = new Set();
    this._deletedFrigateEventIds = new Set();
    // Clean up legacy NEW-arrival localStorage from prior builds. The
    // feature is gone; these keys just take up storage now.
    try {
      localStorage.removeItem("cgc_seen_srcs");
      localStorage.removeItem("cgc_new_arrivals");
      localStorage.removeItem("cgc_dismissed_srcs");
      localStorage.removeItem("cgc_seen_srcs_v2");
      localStorage.removeItem("cgc_new_arrivals_v2");
      localStorage.removeItem("cgc_dismissed_srcs_v2");
      localStorage.removeItem("cgc_arrivals_v");
    } catch (_) { /* localStorage unavailable */ }
    this._forceThumbReset = false;
    this._liveCard = null;
    this._liveCardConfigKey = "";
    // Frozen-stream recovery (see data/stream-watchdog.ts).
    this._streamWatch = new StreamWatchdog();
    // Camera triggers (data/live-triggers.ts). Built lazily from config.
    this._liveTriggers = null;
    this._liveTriggersKey = null;
    this._triggerMap = new Map();
    this._triggerTimer = null;
    this._onCardInteraction = () => this._liveTriggers?.userInteracted(Date.now());
    this._streamWatchTimer = null;
    this._streamLost = false;
    this._streamRecoveries = 0;
    this._recoveryMuted = null;
    // Runtime override of `live_layout`. null = follow config; "single" =
    // user tapped a grid tile and we're temporarily in single-camera mode.
    this._liveLayoutOverride = null;
    // Per-tile player elements when in grid layout, keyed by camera entity.
    this._liveGridTiles = new Map();
    // Narrow-screen cap on the grid's automatic column count. null = uncapped.
    this._gridMaxCols = null;
    this._gridResizeObserver = null;
    this._gridResizeTarget = null;
    this._gridResizeTimer = null;
    this._liveCardPending = null;
    this._rtcPeerConnection = null;
    this._rtcWebSocket = null;
    this._signedWsPath = null;
    this._signedWsPathTs = 0;
    this._micState = "idle";
    this._micErrorCode = "";
    // PTZ overlay state. `_ptzActive` toggles the joystick + zoom + home
    // overlay on top of the live preview. Press-and-hold tracking lives
    // in `_ptzHold*`: the direction (or named action like zoom) we're
    // currently looping pulses for, the repeat-interval timer for pulse-
    // type dispatchers, and the pointer-id guard so a stray mouse hover-
    // out doesn't kill an active touch. Joystick thumb position is the
    // offset from the base centre in px, snapped back to {0,0} on
    // release.
    this._ptzActive = false;
    this._ptzHoldDirection = null;
    this._ptzHoldAction = null;
    this._ptzHoldTimer = null;
    this._ptzHoldPointerId = null;
    this._ptzJoystickThumb = { x: 0, y: 0 };
    this._ptzJoystickPointerId = null;
    // Cached joystick rect — captured at pointerdown so pointermove
    // doesn't trigger a synchronous layout flush per frame.
    this._ptzJoystickGeom = null;
    // 0–1 magnitude of the active joystick drag, or null when the pan
    // input comes from a discrete source (button / keyboard). Continuous
    // dispatchers use it to scale speed analog.
    this._ptzJoystickMagnitude = null;
    // Per-axis components of the joystick (horizontal + vertical) when
    // both clear the dead-zone — feeds the secondary-axis parameter to
    // ONVIF dispatch for diagonal pan. Null between drags.
    this._ptzJoystickAxes = null;
    // Transient "just pressed" flag for the Home button. Set true on
    // `_onPtzHome`, cleared after 220ms so the user sees a brief
    // confirmation flash on a one-shot action.
    this._ptzHomePressed = false;
    this._ptzHomePressedTimer = null;
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
              notification_id: MIC_NOTIFICATION_ID,
            });
          } catch (_) {
            /* persistent_notification.create unavailable */
          }
        },
      },
      onChange: () => {
        const next = this._micClient.state();
        this._onMicAudioState(next);
        if (next !== this._micState) this._micState = next;
        const errCode = this._micClient.error()?.code ?? "";
        if (errCode !== this._micErrorCode) this._micErrorCode = errCode;
        this.requestUpdate();
      },
      audioProcessing: this._micAudioProcessingFromConfig(),
      iceServers: this._micIceServersFromConfig(),
      iceTransportPolicy: this.config?.live_mic_force_relay ? "relay" : "all",
    });
    this._autoAspectVideo = null;
    this._autoAspectObs = null;
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
    this._debugOpen = false;
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
    this._hybridDrawerOpen = false;
    this._hybridClipOpen = false;
    this._hybridDayMenuOpen = false;
    this._hybridDrawerWidthPct = 50;
    this._hybridResizing = false;
    this._hybridHoverTimer = null;
    this._hybridCloseTimer = null;
    // Drawer clip layout ("grid" | "list"). Persisted to localStorage so the
    // user's choice survives a page reload.
    this._hybridLayout = (() => {
      try {
        const raw = (typeof localStorage !== "undefined") && localStorage.getItem("cgc_hybrid_layout");
        if (raw === "grid" || raw === "list") return raw;
      } catch (_) { /* ignore */ }
      return "grid";
    })();
    this._liveSelectedCamera = "";
    // One-shot: set when a `cgc_view=gallery` deep-link resolves at first
    // hass, consumed the first time the item list actually populates (see
    // `updated()`) so the newest clip opens regardless of thumb_sort_order.
    this._pendingUrlGallerySelectNewest = false;
    this._liveMuted = true;
    this._talkbackAudio = null;
    // Bumped whenever mounted/pending live media becomes stale (teardown,
    // camera switch). Awaited setup steps compare against it before commit.
    this._liveViewGeneration = 0;
    this._liveAudioTimer = null;
    this._liveAudioSuspended = true;
    this._liveAudioLastVideo = null;
    this._liveAudioLastStream = null;
    this._liveAudioStatus = "Live audio inactive";
    this._liveAudioPlaybackError = "";
    this._liveAudioPlayAttempt = 0;
    this._livePipActive = false;
    this._galleryPipActive = false;
    this._galleryPlaying = false;
    this._galleryCurrentTime = 0;
    this._galleryDuration = 0;
    this._galleryAutoplayAll = false;
    this._galleryPlaybackSpeed = 1;
    this._thumbSwipeEl = null;
    this._thumbSwipeItem = null;
    this._thumbSwipeStartX = 0;
    this._thumbSwipeStartY = 0;
    this._thumbSwipeDx = 0;
    this._thumbSwipeActive = false;
    this._scrollPillText = "";
    this._scrollPillVisible = false;
    this._scrollPillTimer = null;
    this._micWaveRaf = null;
    this._micFreqBuf = new Uint8Array(256); // fftSize/2 — freq-domain bins
    // HA's own two-way audio (2026.11 Labs): camera id → true/false/"pending"
    // from `camera/capabilities`, and the active player's microphone state.
    this._nativeTalkCaps = new Map();
    this._nativeMicState = "off";
    this._onMicPointerDown = (e) => {
      e.stopPropagation();
      // Resolve the mic stream for the camera that's currently in focus.
      // Different cameras can have different backchannels; a camera with
      // no entry in `live_mic_streams` (and no legacy fallback) returns ""
      // and the pill should already be hidden — defensive check below.
      const cameraId = this._getEffectiveLiveCamera();
      if (this._talkSourceFor(cameraId) === "native") {
        this._onNativeTalkPointer("down");
        return;
      }
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
      if (this._talkSourceFor(this._getEffectiveLiveCamera()) === "native") {
        this._onNativeTalkPointer("up");
        return;
      }
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
    // Bumped whenever a fullscreen entry/exit becomes stale (genuine exit,
    // teardown). Pending native entries compare against it before acting.
    this._cardFullscreenGeneration = 0;
    this._imgFsOpen = false;
    this._hamburgerOpen = false;
    // Entity id of the input_select / select button whose option list is
    // open in the live menu panel (#215), or null for the regular menu.
    this._menuSelectEntity = null;

    // Pinch-to-zoom state (only active in fullscreen live mode)
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
    this._lastFsTapTime = 0;


    this._onLiveCameraKeydown = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (!this._isLiveActive()) return;
      if (this._imgFsOpen) return;
      // PTZ overlay owns the arrow keys when active — short-circuit so
      // the user isn't both panning the camera and switching cameras.
      if (this._ptzActive) return;
      if (this._getLiveCameraOptions().length <= 1) return;
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) return;
      const focusInside = this.contains(document.activeElement);
      const hovered = this.matches(":hover");
      if (!focusInside && !hovered) return;
      e.preventDefault();
      this._navLiveCamera(e.key === "ArrowRight" ? 1 : -1);
    };

    // PTZ keyboard handlers. Active only while the overlay is on.
    // Suppress `e.repeat` events — browsers spam keydown ~30/sec while a
    // key is held, but our own press handler already manages repetition
    // via `_ptzHoldTimer` for pulse-types and via the integration for
    // continuous-types. Same focus/hover guard as the camera-nav handler.
    this._onPtzKeyDown = (e) => {
      if (!this._ptzActive || e.repeat) return;
      const direction = ({
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      })[e.key];
      if (!direction) return;
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) return;
      const focusInside = this.contains(document.activeElement);
      const hovered = this.matches(":hover");
      if (!focusInside && !hovered) return;
      e.preventDefault();
      // Clear any joystick-magnitude leftover so keyboard input falls
      // back on the configured global/per-camera speed instead of
      // whatever the joystick last reported.
      this._ptzJoystickMagnitude = null;
      this._ptzJoystickAxes = null;
      this._onPtzPress(direction, null);
      // Mirror keyboard input on the joystick thumb so the user sees
      // their direction land on the overlay. Skipped when a pointer is
      // already driving the joystick — pointer wins as source of truth.
      if (this._ptzJoystickPointerId === null) {
        const o = PTZ_JOY_MAX_OFFSET;
        const thumbByDir = {
          up: { x: 0, y: -o },
          down: { x: 0, y: o },
          left: { x: -o, y: 0 },
          right: { x: o, y: 0 },
        };
        this._ptzJoystickThumb = thumbByDir[direction];
        this.requestUpdate();
      }
    };
    this._onPtzKeyUp = (e) => {
      if (!this._ptzHoldDirection) return;
      const direction = ({
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      })[e.key];
      if (direction !== this._ptzHoldDirection) return;
      this._stopPtzHold();
      // Snap the joystick thumb back to centre. The 0.18s ease-out
      // transition in the joystick render handles the animation when
      // `_ptzJoystickPointerId === null` (the keyboard path).
      if (this._ptzJoystickPointerId === null) {
        this._ptzJoystickThumb = { x: 0, y: 0 };
        this.requestUpdate();
      }
    };

    this._onFullscreenChange = () => {
      // A container's shadow root retargets document.fullscreenElement to
      // its host. The root containing this card retains the card target.
      const root = this.getRootNode();
      const element = root.fullscreenElement || root.webkitFullscreenElement || document.fullscreenElement || document.webkitFullscreenElement;
      const isFs = element === this;
      if (isFs) {
        this._liveFallbackCleanup?.();
        this._liveFullscreen = false;
        this.setAttribute('data-live-fs', '');
        this._showPills();
      } else if (this._liveFallbackCleanup) {
        // Unrelated native exit events must not dismiss CSS/top-layer fullscreen.
        if (document.fullscreenElement || document.webkitFullscreenElement) this._exitCardFullscreenFallback();
      } else if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (this.hasAttribute('data-live-fs')) this._cardFullscreenGeneration++;
        this.removeAttribute('data-live-fs');
        this._liveFullscreen = false;
        this._resetZoom();
      }
      this.requestUpdate();
    };

    this._onZoomTouchStart = (e) => {
      if (!this._isZoomAllowed()) return;
      if (isGridLayout(this.config, this._liveLayoutOverride)) return;

      // Handle double-tap zoom for fullscreen image
      if (this._imgFsOpen && e.touches.length === 1) {
        const now = Date.now();
        const touch = e.touches[0];
        if (now - (this._lastFsTapTime || 0) < 300) {
          e.preventDefault();
          this._lastFsTapTime = 0;
          this._toggleFullscreenZoom(touch.clientX, touch.clientY);
          return;
        }
        this._lastFsTapTime = now;
      }

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
      if (!this._isZoomAllowed()) return;
      if (isGridLayout(this.config, this._liveLayoutOverride)) return;
      if (this._zoomIsPinching && e.touches.length >= 2) {
        e.preventDefault();
        const t = e.touches;
        const dist = Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
        this._zoomScale = Math.max(1, Math.min(8, this._zoomPinchScale * (dist / this._zoomPinchDist)));
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
      if (!this._isZoomAllowed() || this._zoomScale <= 1) return;
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
      if (!this._isZoomAllowed()) return;
      if (isGridLayout(this.config, this._liveLayoutOverride)) return;
      // Skip when the wheel is on the hybrid drawer — its overflow:auto
      // body needs the wheel to drive native scroll; otherwise the zoom
      // handler swallows the event and the drawer feels stuck.
      const wheelPath = e.composedPath?.() || [];
      if (wheelPath.some((el) => el?.classList?.contains?.("hybrid-drawer"))) return;
      const host = this._getZoomHost();
      if (!host) return;
      const r = host.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const oldScale = this._zoomScale;
      const newScale = Math.max(1, Math.min(8, oldScale * factor));
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

    this._revealedThumbs = new Set();
    // Cluster expand-on-tap: tracks which cluster representatives the user
    // has clicked open. Keys are MsItem.id (the clip's media-source URI).
    // When expanded, the cluster's members get spliced into `filtered` in
    // chronological position so the gallery treats them as normal items
    // (own index, own click handler, own viewer state).
    this._expandedClusters = new Set();
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
    window.addEventListener("keydown", this._onPtzKeyDown);
    window.addEventListener("keyup", this._onPtzKeyUp);
    document.addEventListener("visibilitychange", this._onPtzVisibilityChange);
    // Capture phase so every tap or key press on the card counts, including
    // ones a control stops from bubbling.
    this.addEventListener("pointerdown", this._onCardInteraction, true);
    this.addEventListener("keydown", this._onCardInteraction, true);
    if (navigator.maxTouchPoints > 0) this._showPills(5000);
    this._startMediaPoll();
    // Idempotent — if hass isn't set yet, returns early; the firstHass branch
    // in `set hass` then catches it. Covers disconnect→reconnect cycles where
    // _hass stays set but the previous subscription was torn down.
    this._subscribeFrigateEvents();
    this.requestUpdate(); // Remount live media after a disconnect/reconnect.
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
    window.removeEventListener("keydown", this._onPtzKeyDown);
    window.removeEventListener("keyup", this._onPtzKeyUp);
    this._exitOwnedFullscreen();

    this._stopMediaPoll();
    this._stopStreamWatch();
    this.removeEventListener("pointerdown", this._onCardInteraction, true);
    this.removeEventListener("keydown", this._onCardInteraction, true);
    this._stopTriggerTimer();
    this._liveTriggers?.reset();
    this._unsubscribeFrigateEvents();
    if (this._bulkHintTimer) clearTimeout(this._bulkHintTimer);
    if (this._scrollPillTimer) { clearTimeout(this._scrollPillTimer); this._scrollPillTimer = null; }
    this._scrollPillVisible = false;
    if (this._snapshotToastTimer) { clearTimeout(this._snapshotToastTimer); this._snapshotToastTimer = null; }
    this._cancelHybridHoverOpen();
    // Tear down the PTZ press-and-hold loop — if the card is removed mid-
    // press (camera card replaced, dashboard navigated away), the interval
    // would otherwise outlive the element and (for continuous types) leave
    // the camera spinning.
    this._stopPtzHold();
    document.removeEventListener("visibilitychange", this._onPtzVisibilityChange);

    this._bulkHintTimer = null;

    this._clearPreviewVideoHostPlayback();
    this._teardownLiveView();
    this._stopGridResizeObserver();

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
      } else if (this.config?.start_mode === "hybrid" && this._hasLiveConfig()) {
        this._viewMode = "hybrid";
      }
      // Notification deep-link (issue #218): `?cgc_id=<url_id>` overrides
      // `start_mode`/the default live camera. Runs after the block above so
      // a URL override lands on top of the configured default, and after
      // setConfig's own `_liveSelectedCamera` default (src/index.js ~4997).
      const urlActions = parseUrlActions({
        search: window.location.search,
        urlId: this.config?.url_id,
        cameras: this._getLiveCameraOptions(),
        hasLiveConfig: this._hasLiveConfig(),
      });
      if (urlActions.view) {
        this._viewMode = urlActions.view;
        if (urlActions.view === "media") this._pendingUrlGallerySelectNewest = true;
      }
      if (urlActions.camera) {
        this._liveSelectedCamera = urlActions.camera;
        // A camera deep-link names one camera, so break out of grid layout
        // onto it — otherwise `isGridLayout()` would stay true and the
        // deep-linked camera would never actually be shown (issue #218's
        // reported use case). Reuses the same override `_onGridTileTap`
        // sets, so the existing "Back to grid" pill picks it up for free.
        this._liveLayoutOverride = "single";
      }
      // Fire-and-forget: subscribe to HA's Frigate event push stream.
      this._subscribeFrigateEvents();
      this.requestUpdate();
      return;
    }

    // Forward hass to live card immediately — no re-render needed just for token refresh
    if (this._liveCard) this._liveCard.hass = hass;

    this._checkTriggerEntities(oldHass, hass);

    // Only re-render when an entity we actually display has changed state
    const sensorIds = this._sensorClient.getEntityIds();
    const cameraIds = getLiveCameraEntityIds(this.config);

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
    const mediaMode = sm === "media" || sm === "combined";
    const frigateTriggers = this.config?.live_triggers?.frigate === true && this._hasLiveConfig();
    if (!mediaMode && !frigateTriggers) return;
    // Without a Frigate media source, fall back to Frigate's default client
    // id so live-only cards can still use Frigate triggers.
    const instanceId = this._frigateInstanceId() || (frigateTriggers ? "frigate" : null);
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
    if (payload?.type === "new") this._onFrigateTrigger(payload);
    if (payload?.type !== "end") return;
    const sm = this.config?.source_mode;
    if (sm !== "media" && sm !== "combined") return;

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
    const filteredBeforeCluster = filteredAll.slice(0, Math.min(cap, filteredAll.length));
    // Mirror the render's view (cluster expansion injects members) so
    // _selectedIndex resolves to the same slot — otherwise tapping a
    // member updates the index but the player here sees a different
    // list and plays the wrong (or no) clip.
    const filtered = this._injectExpandedClusterMembers(filteredBeforeCluster);

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
      if (!this._isVideoForSrc(src)) continue;
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
      video.controls = false;
      video.playsInline = true;
      // `auto` so the browser buffers proactively the moment we set `src`.
      // With `metadata` the browser only fetches the moov atom and waits
      // for play() before buffering, which adds a perceptible delay on
      // click → first-frame.
      video.preload = "auto";

      // Wire transport state to gallery pills (play/pause + time display).
      // requestUpdate via the existing _galleryPlaying/_galleryCurrentTime
      // setters keeps the pill row in sync without polling.
      video.addEventListener("play", () => {
        this._galleryPlaying = true;
        this._startGalleryProgressRaf();
      });
      video.addEventListener("pause", () => {
        this._galleryPlaying = false;
        this._videoLastPauseAt = performance.now();
        this._stopGalleryProgressRaf();
      });
      video.addEventListener("ended", () => {
        this._galleryPlaying = false;
        this._stopGalleryProgressRaf();
        if (this._galleryAutoplayAll) {
          // Defer so the `ended` event finishes propagating before we
          // tear down the src + swap to the next clip.
          queueMicrotask(() => this._autoplayAdvance());
        }
      });
      video.addEventListener("timeupdate", () => {
        this._galleryCurrentTime = video.currentTime || 0;
      });
      video.addEventListener("loadedmetadata", () => {
        this._galleryDuration = isFinite(video.duration) ? video.duration : 0;
        this._galleryCurrentTime = video.currentTime || 0;
        // playbackRate resets on src swap — reapply so the user's speed
        // choice carries across clips during autoplay-all.
        video.playbackRate = this._galleryPlaybackSpeed || 1;
      });
      video.addEventListener("durationchange", () => {
        this._galleryDuration = isFinite(video.duration) ? video.duration : 0;
      });
      video.addEventListener("webkitendfullscreen", () => this._onVideoFullscreenExit(video));
      video.addEventListener("fullscreenchange", () => {
        // The document retargets fullscreen inside shadow DOM to the card host.
        if (!this._isVideoFullscreen(video)) this._onVideoFullscreenExit(video);
      });

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
        // Enqueue the poster only after canplay so the capture doesn't
        // tie up the preview's video connection during initial load.
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

      try {
        video.load();
      } catch (_) {}

      if (shouldAutoplay) {
        // Kick play() immediately after load() — the browser will buffer
        // aggressively to honor the play request, which is faster than
        // waiting for the `canplay` event before requesting playback.
        // Promise rejection on rapid src-swaps is expected and silenced.
        // `muted` is restored here because video.load() resets it to
        // `defaultMuted` in some browsers.
        video.muted = shouldMute;
        video.play().catch(() => {});
      }
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
      hass: this._hass,
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

  // Tap-toggle for video previews: tap shows + arms the auto-hide timer,
  // a second tap hides immediately. Useful on short clips where the 2.5s
  // overlay would otherwise cover half the playback.
  _hidePillsNow() {
    clearTimeout(this._pillsTimer);
    this._pillsTimer = null;
    this._pillsHideActive = false;
    this._pillsVisible = false;
    this.requestUpdate();
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

  /** Fire HA's `haptic` event on the window. The HA frontend's haptic
   * mixin listens for it: on Android it forwards to `navigator.vibrate`,
   * and the iOS Companion App intercepts the WKWebView bridge to call
   * `UIImpactFeedbackGenerator` natively — which is the only way to get
   * a tap-vibration on iPhones, since Apple's Safari/WebKit doesn't
   * ship the Vibration API. Skip mouse / pen pointers where a haptic
   * would be meaningless. */
  _ptzHaptic(ev) {
    if (ev && ev.pointerType && ev.pointerType !== "touch") return;
    if (typeof window === "undefined") return;
    try {
      window.dispatchEvent(
        new CustomEvent("haptic", { detail: "light", bubbles: true, composed: true })
      );
    } catch (_) {}
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
    // In hybrid mode the preview shows the live feed — unless a clip is being
    // played in-place (`_hybridClipOpen`). Then the preview renders as media,
    // but `_viewMode` stays "hybrid" so the gallery toolbar + thumb strip
    // remain hidden.
    return (
      this._hasLiveConfig() &&
      (this._viewMode === "live" || (this._viewMode === "hybrid" && !this._hybridClipOpen))
    );
  }

  /** True when the view is in hybrid mode (live + edge drawer with clips). */
  _isHybridActive() {
    return this._hasLiveConfig() && this._viewMode === "hybrid";
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
    const cams = getLiveCameraEntityIds(this.config);
    for (const id of cams) this._probeCameraResolution(id);

    const sections = buildDiagnostics({
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
    sections.push({
      title: "Stream recovery",
      icon: "mdi:restart-alert",
      rows: [
        ["Auto-recover", this.config?.live_auto_recover === false ? "off" : "on"],
        ["Rebuilds this session", String(this._streamRecoveries)],
        ["Status", this._streamLost ? "stopped, gave up" : "ok"],
      ],
    });
    sections.push({
      title: "Listening audio",
      icon: "mdi:volume-high",
      rows: [["Status", this._liveAudioPlaybackError || this._liveAudioStatus]],
    });
    return sections;
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

    const generation = this._liveViewGeneration;
    await customElements.whenDefined("ha-camera-stream");
    if (generation !== this._liveViewGeneration || !this._isLiveActive()) return null;
    const player = document.createElement("ha-camera-stream");
    player.stateObj = this._hass?.states?.[entity];
    player.hass = this._hass;
    // HA two-way audio (2026.11): mirror the player's microphone state.
    this._nativeMicState = "off";
    player.addEventListener("microphone-changed", (ev) => {
      if (this._liveCard !== player) return;
      this._nativeMicState = String(ev?.detail?.state || "off");
      this.requestUpdate();
    });
    player.muted = true; // start muted so autoplay works; _syncLiveMuted unmutes afterwards
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

    // Close the existing peer connection and WebSocket, if any
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
      // Match on the promise, not the key: a newer call for the same key has
      // its own in-flight entry that must survive this one's completion.
      if (this._liveCardPending?.promise === promise) this._liveCardPending = null;
    }
  }

  async _ensureLiveCardFromUrlImpl(url, key) {
    const generation = this._liveViewGeneration;
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

      // Use HA's built-in go2rtc (auth/sign_path) or an external go2rtc instance
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
          if (generation !== this._liveViewGeneration) return null;
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

      // Forward ICE candidates to go2rtc
      pc.onicecandidate = (e) => {
        if (e.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "webrtc/candidate", value: e.candidate.candidate }));
        }
      };
    } catch (err) {
      if (generation !== this._liveViewGeneration) return null;
      console.warn("[CGC] RTSP stream failed:", err);
    }

    if (generation !== this._liveViewGeneration || !this._isLiveActive()) return null;
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

    // First entry in `live_cameras` is the default. Fall back to the first
    // available option from the resolver when the array is empty / not yet
    // populated (e.g. stub config).
    const options = this._getLiveCameraOptions();
    return options[0] || "";
  }

  /**
   * Resolve the per-camera crop rectangle for the currently active live
   * camera and emit a `style` string with `--crop-*` CSS vars consumed by
   * `.live-card-host.has-crop video` in styles.ts. Returns an empty string
   * when no crop is configured (or the rect is the full frame), so the host
   * element doesn't get a `has-crop` class and the video renders normally.
   */
  /**
   * Preview aspect-ratio for the inline style. When a live crop is active
   * and the live view is showing, the preview pane resizes to match the
   * crop region's aspect — the cropped video fills the new shape without
   * distortion. In gallery view (or no crop) the user's configured
   * `aspect_ratio` is used.
   */
  _getPreviewAspectRatio(isLive) {
    if (!isLive) return this._aspectRatio || "16/9";
    // Grid mode sizes the pane to the tile grid, so every tile lands at the
    // configured ratio instead of being squashed into a fixed 16/9 box.
    if (isGridLayout(this.config, this._liveLayoutOverride)) {
      return this._getGridLayout(getGridCameraEntities(this.config).length).aspectRatio;
    }
    const active = this._getEffectiveLiveCamera?.() || "";
    if (active) {
      const crop = liveCameraEntry(active, this.config)?.crop;
      if (crop) {
        const w = Number(crop.w);
        const h = Number(crop.h);
        if (
          Number.isFinite(w) && Number.isFinite(h) &&
          w > 0 && h > 0 &&
          !(w === 100 && h === 100)
        ) {
          // Container takes the crop's real-world aspect ratio.
          // The crop's x/y/w/h are %-coords against the source frame;
          // multiplying by the source's pixel aspect gives the real
          // shape of the cropped region. source_ar is detected and
          // stored at crop time (4:3 for the doorbell, 16:9 for most
          // cams). Legacy crops without source_ar fall back to 16/9.
          const ar = String(crop.source_ar || "16/9").split("/").map((s) => Number(s.trim()));
          const arW = ar.length === 2 && ar[0] > 0 ? ar[0] : 16;
          const arH = ar.length === 2 && ar[1] > 0 ? ar[1] : 9;
          const newW = arW * w;
          const newH = arH * h;
          return rotatedAspect(`${newW}/${newH}`, liveCameraRotation(active, this.config));
        }
      }
    }
    return rotatedAspect(this._aspectRatio || "16/9", liveCameraRotation(active, this.config));
  }

  // CSS variables that rotate (and crop) the single-camera live picture, or
  // "" when the active camera is not rotated. Grid tiles do their own.
  _getLiveRotationStyle() {
    if (isGridLayout(this.config, this._liveLayoutOverride)) return "";
    const active = this._getEffectiveLiveCamera();
    const rotation = liveCameraRotation(active, this.config);
    if (!rotation) return "";
    return rotationStyle(rotation);
  }

  // Rotation of the picture the zoom acts on (single live view only).
  _zoomRotation() {
    if (!this._isLiveActive() || isGridLayout(this.config, this._liveLayoutOverride)) return 0;
    return liveCameraRotation(this._getEffectiveLiveCamera(), this.config);
  }

  // Grid tiles: rotation only (crop is single-camera only). The tile is the
  // size container; its stream wrapper carries the rotation.
  _applyTileRotation(tile, entity) {
    const style = rotationStyle(liveCameraRotation(entity, this.config));
    tile.classList.toggle("has-rot", !!style);
    for (const name of ["--rot", "--rot-w", "--rot-h"]) {
      tile.style.removeProperty(name);
    }
    for (const decl of style.split(";")) {
      const i = decl.indexOf(":");
      if (i > 0) tile.style.setProperty(decl.slice(0, i), decl.slice(i + 1));
    }
  }

  _getLiveCropStyle() {
    // Crop is a single-camera feature — in grid layout the host wraps
    // multiple ha-camera-stream tiles and the transform would smear over
    // all of them. Bail out so the host doesn't pick up the .has-crop
    // class in grid mode.
    if (isGridLayout(this.config, this._liveLayoutOverride)) return "";
    const active = this._getEffectiveLiveCamera();
    if (!active) return "";
    // By live id, so stream-URL cameras (`__cgc_stream_<n>__`) find their
    // crop too.
    const crop = liveCameraEntry(active, this.config)?.crop;
    if (!crop) return "";
    const x = Number(crop.x);
    const y = Number(crop.y);
    const w = Number(crop.w);
    const h = Number(crop.h);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "";
    if (x === 0 && y === 0 && w === 100 && h === 100) return ""; // no-op
    return `--crop-x:${x}%;--crop-y:${y}%;--crop-w:${w};--crop-h:${h};`;
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

  // The element that shows the live picture: a <video> for streams, or the
  // <img> Home Assistant uses for MJPEG cameras (#289).
  _findLiveMedia() {
    const video = this._findLiveVideo();
    if (video) return video;
    const host = this.renderRoot?.querySelector("#live-card-host");
    if (!host) return null;
    const search = (root) => {
      const img = root.querySelector("img");
      if (img) return img;
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

  // Size the live pane to the picture's own aspect ratio once it is known.
  // Video reports it at loadedmetadata; an MJPEG image only after its first
  // frame, so keep checking for a while (#289).
  _setupAutoAspectRatio() {
    if (this._autoAspectObs) {
      clearInterval(this._autoAspectObs);
      this._autoAspectObs = null;
    }
    this._autoAspectVideo = null;

    const applyRatio = (el) => {
      const next = mediaAspect(el);
      if (!next) return false;
      if (next !== this._aspectRatio) {
        this._aspectRatio = next;
        this.requestUpdate();
      }
      return true;
    };

    const tryBind = () => {
      const el = this._findLiveMedia();
      if (!el) return false;
      if (applyRatio(el)) return true;
      if (el !== this._autoAspectVideo) {
        this._autoAspectVideo = el;
        el.addEventListener(el.localName === "video" ? "loadedmetadata" : "load", () => applyRatio(el), { once: true });
      }
      return false;
    };

    if (!tryBind()) {
      let elapsed = 0;
      this._autoAspectObs = setInterval(() => {
        elapsed += 500;
        if (tryBind() || elapsed >= 15000) {
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


  _resetZoom() {
    this._zoomScale = 1;
    this._zoomPanX = 0;
    this._zoomPanY = 0;
    this._zoomIsPinching = false;
    this._zoomIsPanning = false;
    this._applyZoom();
  }

  _isZoomAllowed() {
    if (this._imgFsOpen) return this.config?.fullscreen_zoom !== false;
    if (this._isLiveActive() || this._previewOpen) return true;
    return false;
  }

  _getZoomHost() {
    if (this._imgFsOpen && this.config?.fullscreen_zoom !== false) {
      return this.renderRoot?.querySelector('.img-fs-overlay img');
    }
    if (this._isLiveActive()) return this.renderRoot?.querySelector('#live-card-host');
    if (this._previewOpen) return this.renderRoot?.querySelector('#preview-video-host')
                                ?? this.renderRoot?.querySelector('.pimg');
    return null;
  }

  _clampZoomPan() {
    const host = this._getZoomHost();
    if (!host) return;
    // A quarter-turned live host is as wide on screen as it is tall in layout.
    const quarter = isQuarterTurn(this._zoomRotation());
    const w = quarter ? host.offsetHeight : host.offsetWidth;
    const h = quarter ? host.offsetWidth : host.offsetHeight;
    const maxX = w * (this._zoomScale - 1) / 2;
    const maxY = h * (this._zoomScale - 1) / 2;
    this._zoomPanX = Math.max(-maxX, Math.min(maxX, this._zoomPanX));
    this._zoomPanY = Math.max(-maxY, Math.min(maxY, this._zoomPanY));
  }

  _applyZoom() {
    const host = this._getZoomHost();
    const preview = this.renderRoot?.querySelector('.preview');
    const fsOverlay = this.renderRoot?.querySelector('.img-fs-overlay');
    if (!host) {
      if (preview) { preview.style.touchAction = ''; preview.style.cursor = ''; }
      if (fsOverlay) { fsOverlay.style.cursor = ''; }
      return;
    }
    if (this._zoomScale <= 1) {
      host.style.transform = '';
      host.style.transformOrigin = '';
      if (this._isLiveActive()) host.style.cursor = '';
      if (preview) { preview.style.touchAction = ''; preview.style.cursor = ''; }
      if (fsOverlay) { fsOverlay.style.cursor = ''; }
    } else {
      host.style.transformOrigin = 'center center';
      // The live host may be rotated (CSS `rotate`, applied before this
      // transform), so express the on-screen pan in its own coordinates.
      const pan = screenToLocal(this._zoomPanX, this._zoomPanY, this._zoomRotation());
      host.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${this._zoomScale})`;
      if (this._isLiveActive()) host.style.cursor = this._zoomIsPanning ? 'grabbing' : 'grab';
      if (preview) {
        preview.style.touchAction = 'none';
        preview.style.cursor = this._zoomIsPanning ? 'grabbing' : 'grab';
      }
      if (fsOverlay) {
        fsOverlay.style.cursor = this._zoomIsPanning ? 'grabbing' : 'grab';
      }
    }
  }

  _toggleFullscreenZoom(clientX, clientY) {
    const host = this._getZoomHost();
    if (!host) return;
    if (this._zoomScale > 1) {
      this._resetZoom();
    } else {
      const r = host.getBoundingClientRect();
      const newScale = 2.5;
      const lcX = r.left + r.width / 2;
      const lcY = r.top + r.height / 2;
      const k = newScale;
      this._zoomPanX = (clientX - lcX) * (1 - k);
      this._zoomPanY = (clientY - lcY) * (1 - k);
      this._zoomScale = newScale;
      this._clampZoomPan();
      this._applyZoom();
    }
  }

  _toggleGalleryMute() {
    this._galleryMuted = !this._galleryMuted;
    if (this._previewVideoEl) this._previewVideoEl.muted = this._galleryMuted;
    this.requestUpdate();
  }

  _toggleLiveMute() {
    this._liveMuted = !this._liveMuted;
    if (this._talkbackAudio) {
      this._talkbackAudio.muted = this._liveMuted;
      this._talkbackAudio.manual = true;
    }
    // Run play() in the speaker gesture, not just in a later Lit update.
    this._syncLiveMuted(!this._liveMuted);
    this.requestUpdate();
  }

  _onMicAudioState(next) {
    if (next !== "idle" && next !== "error") {
      if (!this._talkbackAudio) {
        this._talkbackAudio = { muted: this._liveMuted, manual: false, activated: false };
      }
      if (next === "active" && !this._talkbackAudio.activated) {
        this._talkbackAudio.activated = true;
        if (!this._talkbackAudio.manual) {
          this._liveMuted = false;
          this._syncLiveMuted(true);
        }
      }
      return;
    }
    if (!this._talkbackAudio) return;
    this._liveMuted = this._talkbackAudio.muted;
    this._talkbackAudio = null;
    this._syncLiveMuted(!this._liveMuted);
  }

  _toggleLiveFullscreen() {
    const video = this._findLiveVideo();
    const ua = navigator.userAgent || "";
    // HA Companion's Android WebView mishandles requestFullscreen on a
    // custom element (system bar hides but the element doesn't fill the
    // viewport). The CSS fallback works correctly there. iOS Companion is
    // unaffected because the video.webkitEnterFullscreen path runs first.
    const isAndroidWebView = /Android/.test(ua) && (/Home Assistant\//.test(ua) || /; wv\)/.test(ua));

    // Exit only fullscreen owned by this card, not another dashboard card.
    if (this._ownsFullscreen() || video?.webkitDisplayingFullscreen || this._liveFullscreen) {
      if (this._ownsFullscreen() || video?.webkitDisplayingFullscreen) {
        this._cardFullscreenGeneration++;
        this._exitOwnedFullscreen(video);
        return;
      }
      this._exitCardFullscreenFallback();
      return;
    }

    const target = liveFullscreenTarget(
      this.config?.live_fullscreen,
      isGridLayout(this.config, this._liveLayoutOverride),
      video,
      !!document.fullscreenEnabled,
    );

    // iOS Safari: webkitEnterFullscreen on the video element
    if (target === "webkit") {
      this._setLiveVideoControls(video, true);
      armWebkitExitResume(video);
      video.addEventListener("webkitendfullscreen", () => this._setLiveVideoControls(video, false), { once: true });
      video.webkitEnterFullscreen();
      return;
    }

    if (target === "standard") {
      this._setLiveVideoControls(video, true);
      const onChange = () => {
        if (this._isVideoFullscreen(video)) return;
        video.removeEventListener("fullscreenchange", onChange);
        this._setLiveVideoControls(video, false);
      };
      video.addEventListener("fullscreenchange", onChange);
      video.requestFullscreen().catch(() => {
        video.removeEventListener("fullscreenchange", onChange);
        this._setLiveVideoControls(video, false);
        this._enterCardFullscreen(isAndroidWebView);
      });
      return;
    }

    this._enterCardFullscreen(isAndroidWebView);
  }

  _enterCardFullscreen(isAndroidWebView) {
    // Card fullscreen belongs to the live view, not an individual camera:
    // a camera swap neither bumps the generation nor restarts the entry.
    const generation = this._cardFullscreenGeneration;
    const fallback = () => {
      // A pending entry must not resurrect fullscreen after a genuine exit
      // or teardown; a rejected entry falls back to the CSS/top-layer path
      // (e.g. popup cards where transformed ancestors clip fixed layout).
      if (!this._isLiveActive() || generation !== this._cardFullscreenGeneration) return;
      this._enterCardFullscreenFallback();
    };
    // Android WebView: skip the native API and take the CSS/top-layer path.
    if (!isAndroidWebView && document.fullscreenEnabled && this.requestFullscreen) {
      try {
        Promise.resolve(this.requestFullscreen()).then(() => {
          if (generation !== this._cardFullscreenGeneration || !this._isLiveActive()) this._exitOwnedFullscreen();
        }, fallback);
      } catch (_) { fallback(); }
      return;
    }
    fallback();
  }

  _isVideoFullscreen(video) {
    // Document retargets fullscreen inside shadow DOM to the card host.
    return document.fullscreenElement === video || video.getRootNode?.().fullscreenElement === video;
  }

  _ownsFullscreen() {
    // Start in the card's containing root, not the document: nested cards
    // otherwise see only an ancestor container as the fullscreen target.
    const root = this.getRootNode();
    let element = root.fullscreenElement || root.webkitFullscreenElement || document.fullscreenElement || document.webkitFullscreenElement;
    while (element) {
      if (element === this) return true;
      element = element.parentElement || element.getRootNode?.().host;
    }
    return false;
  }

  _exitOwnedFullscreen(video) {
    if (this._ownsFullscreen()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      try { Promise.resolve(exit?.call(document)).catch(() => {}); } catch (_) {}
    }
    // iOS native video fullscreen is not represented by document.fullscreenElement.
    if (video?.webkitDisplayingFullscreen && typeof video.webkitExitFullscreen === "function") {
      try { video.webkitExitFullscreen(); } catch (_) {}
    }
  }

  _liveFullscreenAncestors() {
    const ancestors = [];
    for (let element = this; element; element = element.parentElement || element.getRootNode?.().host) {
      ancestors.push(element);
    }
    return ancestors;
  }

  _liveFullscreenContainerHidden(ancestors) {
    return ancestors.some((element) => {
      const style = getComputedStyle(element);
      // Bubble closes via transform, not display:none. Observe its local state
      // without altering Bubble CSS, history, or any other popup/card.
      return element.hidden || element.getAttribute("aria-hidden") === "true" ||
        style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" ||
        (element.classList.contains("bubble-pop-up") &&
          (element.classList.contains("is-popup-closed") || element.classList.contains("is-closing")));
    });
  }

  _exitCardFullscreenFallback() {
    this._cardFullscreenGeneration++;
    this._liveFallbackCleanup?.();
    this._liveFullscreen = false;
    this.removeAttribute("data-live-fs");
    this._resetZoom();
    this.requestUpdate();
  }

  _enterCardFullscreenFallback() {
    this._liveFallbackCleanup?.();
    const ancestors = this._liveFullscreenAncestors();
    if (this._liveFullscreenContainerHidden(ancestors)) return;
    let focus = document.activeElement;
    while (focus?.shadowRoot?.activeElement) focus = focus.shadowRoot.activeElement;
    const tabindex = this.getAttribute("tabindex");
    let popover = false;
    const exit = () => this._exitCardFullscreenFallback();
    const onKey = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Route only to the focused/event-owning card, never a background
      // fallback whose global listener happened to be registered first.
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      while (active && active !== this) active = active.parentElement || active.getRootNode?.().host;
      if (!event.composedPath().includes(this) && active !== this) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      exit();
    };
    const onToggle = () => {
      if (popover && this._liveFallbackCleanup === cleanup && !this.matches(":popover-open")) exit();
    };
    const observer = new MutationObserver(() => {
      if (this._liveFullscreenContainerHidden(ancestors)) exit();
    });
    const cleanup = () => {
      // Clear ownership first: hidePopover's deferred toggle must be harmless.
      this._liveFallbackCleanup = null;
      this.removeAttribute("data-live-fs-fallback");
      observer.disconnect();
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("popstate", exit);
      window.removeEventListener("hashchange", exit);
      this.removeEventListener("toggle", onToggle);
      if (popover) {
        try { this.hidePopover(); } catch (_) {}
        this.removeAttribute("popover");
        this.removeAttribute("data-live-fs-popover");
      }
      if (tabindex === null) this.removeAttribute("tabindex");
      else this.setAttribute("tabindex", tabindex);
      if (focus?.isConnected && !this._liveFullscreenContainerHidden(ancestors)) {
        try { focus.focus({ preventScroll: true }); } catch (_) {}
      }
    };
    this._liveFallbackCleanup = cleanup;
    this._liveFullscreen = true;
    this.setAttribute("data-live-fs", "");
    this.setAttribute("data-live-fs-fallback", "");
    // Same host, same shadow/media tree: no disconnect/reparent/stream restart.
    // Manual popovers avoid light-dismiss closing an underlying Bubble popup.
    if (!this.hasAttribute("popover") && typeof this.showPopover === "function" && typeof this.hidePopover === "function") {
      this.setAttribute("popover", "manual");
      this.setAttribute("data-live-fs-popover", "");
      try {
        this.showPopover();
        popover = this.matches(":popover-open");
      } catch (_) {}
      if (!popover) {
        try { this.hidePopover(); } catch (_) {}
        this.removeAttribute("popover");
        this.removeAttribute("data-live-fs-popover");
      }
    }
    // Back follows HA/Bubble's normal navigation; never add or replace history.
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("popstate", exit);
    window.addEventListener("hashchange", exit);
    this.addEventListener("toggle", onToggle);
    for (const element of ancestors) observer.observe(element, {
      attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden"],
    });
    this.setAttribute("tabindex", "-1");
    try { this.focus({ preventScroll: true }); } catch (_) {}
    this._showPills();
    this.requestUpdate();
  }

  // ha-camera-stream re-renders its video, so set the prop there too.
  _setLiveVideoControls(video, on) {
    if (this._liveCard) this._liveCard.controls = on;
    video.controls = on;
  }

  async _toggleLivePip() {
    const video = this._findLiveVideo();
    if (!video) return;
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
        this._livePipActive = false;
      } else {
        if (video.disablePictureInPicture) return;
        if (!this._onLivePipChange) {
          this._onLivePipChange = (e) => {
            const t = e?.target;
            if (!t) return;
            if (e.type === "enterpictureinpicture") this._livePipActive = true;
            else if (e.type === "leavepictureinpicture") this._livePipActive = false;
            this.requestUpdate();
          };
        }
        video.addEventListener("enterpictureinpicture", this._onLivePipChange);
        video.addEventListener("leavepictureinpicture", this._onLivePipChange);
        await video.requestPictureInPicture();
        this._livePipActive = true;
      }
      this.requestUpdate();
    } catch (_) {
      // user dismissed prompt or PiP unsupported on this stream
    }
  }

  // 60fps progress-bar updates via rAF — reads video.currentTime each
  // frame and writes width directly to the fill element, bypassing lit's
  // render cycle (which is bound to timeupdate's ~4Hz cadence).
  _startGalleryProgressRaf() {
    if (this._galleryProgressRaf) return;
    const tick = () => {
      const video = this._previewVideoEl;
      const dur = this._galleryDuration || 0;
      if (!video || dur <= 0) {
        this._galleryProgressRaf = requestAnimationFrame(tick);
        return;
      }
      const pct = Math.max(0, Math.min(100, (video.currentTime / dur) * 100));
      const fill = this.renderRoot?.querySelector(".vid-progress-fill");
      if (fill) fill.style.width = pct + "%";
      this._galleryProgressRaf = requestAnimationFrame(tick);
    };
    this._galleryProgressRaf = requestAnimationFrame(tick);
  }

  _stopGalleryProgressRaf() {
    if (this._galleryProgressRaf) {
      cancelAnimationFrame(this._galleryProgressRaf);
      this._galleryProgressRaf = null;
    }
  }

  _onVidProgressDown(e) {
    const video = this._previewVideoEl;
    if (!video || !this._galleryDuration) return;
    e.stopPropagation();
    e.preventDefault();
    const bar = e.currentTarget;
    try { bar.setPointerCapture(e.pointerId); } catch (_) {}
    this._scrubBarRect = bar.getBoundingClientRect();
    this._scrubPointerId = e.pointerId;
    this._applyVidScrub(e.clientX);

    if (!this._onVidScrubMove) {
      this._onVidScrubMove = (ev) => {
        if (ev.pointerId !== this._scrubPointerId) return;
        this._applyVidScrub(ev.clientX);
      };
      this._onVidScrubUp = (ev) => {
        if (ev.pointerId !== this._scrubPointerId) return;
        try { bar.releasePointerCapture(ev.pointerId); } catch (_) {}
        bar.removeEventListener("pointermove", this._onVidScrubMove);
        bar.removeEventListener("pointerup", this._onVidScrubUp);
        bar.removeEventListener("pointercancel", this._onVidScrubUp);
        this._scrubBarRect = null;
        this._scrubPointerId = null;
      };
    }
    bar.addEventListener("pointermove", this._onVidScrubMove);
    bar.addEventListener("pointerup", this._onVidScrubUp);
    bar.addEventListener("pointercancel", this._onVidScrubUp);
  }

  _applyVidScrub(clientX) {
    const video = this._previewVideoEl;
    const rect = this._scrubBarRect;
    if (!video || !rect || !this._galleryDuration) return;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    video.currentTime = pct * this._galleryDuration;
  }

  _toggleAutoplayAll() {
    this._galleryAutoplayAll = !this._galleryAutoplayAll;
    this.requestUpdate();
  }

  // Advance to the next clip in the current filtered list when the
  // active video ends. Stops auto-play silently when we hit the last
  // clip (no loop yet — feature gated until user asks for it).
  _autoplayAdvance() {
    const { items } = this._currentFilteredItems();
    if (!items || items.length === 0) return;
    const cur = this._selectedIndex ?? 0;
    if (cur >= items.length - 1) {
      this._galleryAutoplayAll = false;
      this.requestUpdate();
      return;
    }
    this._navNext(items.length);
  }

  _cyclePlaybackSpeed() {
    const order = [1, 2, 0.5];
    const idx = order.indexOf(this._galleryPlaybackSpeed || 1);
    this._galleryPlaybackSpeed = order[(idx + 1) % order.length];
    if (this._previewVideoEl) this._previewVideoEl.playbackRate = this._galleryPlaybackSpeed;
    this.requestUpdate();
  }

  _toggleGalleryPlayPause() {
    const video = this._previewVideoEl;
    if (!video) return;
    if (video.paused || video.ended) {
      video.play().catch(() => { /* autoplay policy or aborted load */ });
    } else {
      video.pause();
    }
  }

  async _toggleGalleryPip() {
    const video = this._previewVideoEl;
    if (!video) return;
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
        this._galleryPipActive = false;
      } else {
        if (video.disablePictureInPicture) return;
        if (!this._onGalleryPipChange) {
          this._onGalleryPipChange = (e) => {
            if (e.type === "enterpictureinpicture") this._galleryPipActive = true;
            else if (e.type === "leavepictureinpicture") this._galleryPipActive = false;
            this.requestUpdate();
          };
        }
        video.addEventListener("enterpictureinpicture", this._onGalleryPipChange);
        video.addEventListener("leavepictureinpicture", this._onGalleryPipChange);
        await video.requestPictureInPicture();
        this._galleryPipActive = true;
      }
      this.requestUpdate();
    } catch (_) {
      // user dismissed prompt or PiP unsupported
    }
  }

  // ─── Camera triggers ──────────────────────────────────────────────
  // A trigger entity turning active (or a new Frigate event) switches the
  // card to that camera's live view; after the hold time it goes back. The
  // decisions live in data/live-triggers.ts; this gathers state and acts.
  _ensureLiveTriggers() {
    const settings = this.config?.live_triggers ?? null;
    const cameras = getTriggerCameras(this.config);
    const key = JSON.stringify([settings, cameras]);
    if (key === this._liveTriggersKey) return this._liveTriggers;
    this._liveTriggersKey = key;
    this._stopTriggerTimer();
    this._triggerMap = buildTriggerMap(cameras);
    const wanted = this._triggerMap.size > 0 || settings?.frigate === true;
    this._liveTriggers = wanted
      ? new LiveTriggerController({
          holdMs: (settings?.hold_seconds ?? 30) * 1000,
          cooldownMs: (settings?.cooldown_seconds ?? 10) * 1000,
          returnTo: settings?.return_to ?? "previous",
        })
      : null;
    return this._liveTriggers;
  }

  _checkTriggerEntities(oldHass, hass) {
    if (!oldHass || !this._hasLiveConfig() || !this._ensureLiveTriggers()) return;
    for (const [entityId, cameras] of this._triggerMap) {
      const before = oldHass.states?.[entityId];
      const after = hass.states?.[entityId];
      if (before === after) continue;
      if (isTriggerActivation(entityId, before?.state, after?.state)) {
        this._fireLiveTrigger(cameras[0]);
      }
    }
  }

  _onFrigateTrigger(payload) {
    if (this.config?.live_triggers?.frigate !== true || !this._hasLiveConfig()) return;
    const camera = frigateEventCamera(
      payload,
      this._getLiveCameraOptions(),
      this.config.live_triggers.frigate_labels ?? []
    );
    if (camera) this._fireLiveTrigger(camera);
  }

  _triggerBlocked() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.pictureInPictureElement ||
      this._liveFullscreen ||
      this._imgFsOpen ||
      this._livePipActive ||
      this._galleryPipActive ||
      this._micState !== "idle" ||
      this._nativeMicState !== "off" ||
      this._selectMode ||
      this._thumbMenuOpen
    );
  }

  _fireLiveTrigger(camera) {
    const controller = this._ensureLiveTriggers();
    if (!controller || !camera) return;
    if (!this._getLiveCameraOptions().includes(camera)) return;
    const grid = isGridLayout(this.config, this._liveLayoutOverride);
    const result = controller.fire(camera, Date.now(), {
      blocked: this._triggerBlocked(),
      currentView: {
        mode: this._viewMode,
        camera: this._getEffectiveLiveCamera(),
        layoutOverride: this._liveLayoutOverride,
      },
      showingCamera: this._isLiveActive() && !grid ? this._getEffectiveLiveCamera() : null,
    });
    if (result.action === "ignore") return;
    if (result.action === "switch") this._showTriggeredCamera(camera);
    this._startTriggerTimer();
  }

  _showTriggeredCamera(camera) {
    if (!this._isLiveActive()) {
      this._liveSelectedCamera = camera;
      if (this.config?.live_layout === "grid") this._liveLayoutOverride = "single";
      this._setViewMode("live");
      return;
    }
    if (isGridLayout(this.config, this._liveLayoutOverride)) {
      this._onGridTileTap(camera);
      return;
    }
    if (this._getEffectiveLiveCamera() !== camera) this._selectLiveCamera(camera);
  }

  _startTriggerTimer() {
    if (this._triggerTimer) return;
    this._triggerTimer = setInterval(() => this._tickLiveTriggers(), 1000);
  }

  _stopTriggerTimer() {
    if (this._triggerTimer) {
      clearInterval(this._triggerTimer);
      this._triggerTimer = null;
    }
  }

  _tickLiveTriggers() {
    const controller = this._liveTriggers;
    if (!controller) {
      this._stopTriggerTimer();
      return;
    }
    const result = controller.tick(Date.now());
    if (result.action === "none") return;
    this._stopTriggerTimer();
    if (result.action === "return" && result.to === "gallery") this._setViewMode("media");
    else if (result.action === "return") this._restoreTriggerView(result.view);
  }

  _restoreTriggerView(view) {
    if (!view) return;
    if (view.mode !== "live") {
      this._setViewMode("media");
      this._liveSelectedCamera = view.camera;
      this._liveLayoutOverride = view.layoutOverride;
      return;
    }
    if (!this._isLiveActive()) return;
    if (this.config?.live_layout === "grid" && view.layoutOverride !== "single") {
      this._liveSelectedCamera = view.camera;
      this._returnToGrid();
      return;
    }
    if (this._getEffectiveLiveCamera() !== view.camera) this._selectLiveCamera(view.camera);
  }

  // ─── Frozen-stream recovery ───────────────────────────────────────
  // Samples the live <video> once a second. The decisions live in
  // data/stream-watchdog.ts; this only gathers the numbers and acts on the
  // verdict. Single-camera live view only; grid tiles are not watched.
  _startStreamWatch() {
    if (this._streamWatchTimer) return;
    this._streamWatchTimer = setInterval(() => this._tickStreamWatch(), 1000);
  }

  _stopStreamWatch() {
    if (this._streamWatchTimer) {
      clearInterval(this._streamWatchTimer);
      this._streamWatchTimer = null;
    }
    this._resetStreamWatch();
  }

  _resetStreamWatch() {
    this._streamWatch.reset();
    if (this._streamLost) {
      this._streamLost = false;
      this.requestUpdate();
    }
  }

  _tickStreamWatch() {
    const watching = this._isLiveActive()
      && !isGridLayout(this.config, this._liveLayoutOverride)
      && this.config?.live_auto_recover !== false;
    if (!watching) {
      this._resetStreamWatch();
      return;
    }
    const video = this._findLiveVideo();
    // Never judge or rebuild while the user is on a screen we cannot restore:
    // hidden tab, native video fullscreen, Picture-in-Picture, or talkback.
    const blocked = document.hidden
      || !!document.pictureInPictureElement
      || (!!video && (document.fullscreenElement === video || !!video.webkitDisplayingFullscreen))
      || this._micState !== "idle"
      || this._nativeMicState !== "off";
    const verdict = this._streamWatch.observe(
      video
        ? { t: Date.now(), key: video, currentTime: video.currentTime, paused: video.paused, ended: video.ended }
        : null,
      blocked,
    );
    if (verdict === "recover") {
      this._recoverLiveStream();
    } else if (verdict === "give-up") {
      this._streamLost = true;
      this.requestUpdate();
    } else if (this._streamLost && !this._streamWatch.givenUp) {
      // The stream moved again on its own, so the watchdog lifted its give-up.
      this._streamLost = false;
      this.requestUpdate();
    }
  }

  // Rebuild the live player in place. Same path as a camera swap: full
  // teardown (closes WebRTC/WS), keep card fullscreen, then mount again.
  async _recoverLiveStream() {
    this._streamRecoveries++;
    // Keep the viewer's mute choice across the rebuild.
    this._recoveryMuted = this._liveMuted;
    this._teardownLiveView({ preserveCardFullscreen: true });
    this._signedWsPath = null;
    this.requestUpdate();
    await this.updateComplete;
    this._mountLiveCard();
  }

  // "Try again" on the stream-stopped notice: fresh set of attempts.
  _retryLiveStream() {
    this._streamWatch.reset();
    this._streamLost = false;
    this._recoverLiveStream();
  }

  _renderStreamLostBanner() {
    if (!this._streamLost || !this._isLiveActive()) return html``;
    return html`
      <div class="snapshot-toast stream-lost" role="status" aria-live="polite">
        <span>Stream stopped</span>
        <button
          type="button"
          class="stream-lost-retry"
          @pointerdown=${(e) => e.stopPropagation()}
          @click=${(e) => { e.stopPropagation(); this._retryLiveStream(); }}
        >Try again</button>
      </div>
    `;
  }

  // Force-rebuild the live card so the underlying stream reconnects.
  // Works for both webrtc + ha-camera-stream paths because the next
  // render's _ensureLiveCard* call recreates the player from scratch.
  _refreshLiveStream() {
    try { this._liveCard?.remove?.(); } catch (_) {}
    this._liveCard = null;
    this._liveCardConfigKey = "";
    this.requestUpdate();
  }

  /**
   * Capture the current live frame and trigger a download. Draws the
   * `<video>` element onto an off-screen canvas at its native resolution
   * and exports a JPG. Filename includes the camera entity + ISO
   * timestamp so multiple snapshots stay distinct.
   *
   * Works through whatever transform the live host has applied (e.g. a
   * crop transform), because canvas's drawImage(video) samples the
   * decoded frame bytes — not the rendered DOM. So a cropped live view
   * still produces a snapshot of the full source frame. If the user
   * wants the *cropped* image, they should use the OS-level screenshot.
   */
  _captureLiveSnapshot() {
    const video = this._findLiveVideo();
    if (!video || !video.videoWidth || !video.videoHeight) {
      this._showSnapshotToast("Camera not ready");
      return;
    }
    // Shared error string — re-used by the sync drawImage catch and the
    // async toBlob === null path, both of which indicate the same root
    // cause (canvas tainted by a cross-origin stream).
    const TAINT_MSG = "Snapshot blocked (cross-origin stream)";
    try {
      // A rotated camera saves the picture the way it is shown.
      const geo = snapshotGeometry(
        video.videoWidth,
        video.videoHeight,
        liveCameraRotation(this._getEffectiveLiveCamera?.(), this.config)
      );
      const canvas = document.createElement("canvas");
      canvas.width = geo.width;
      canvas.height = geo.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        this._showSnapshotToast("Snapshot failed (no canvas)");
        return;
      }
      ctx.translate(geo.width / 2, geo.height / 2);
      ctx.rotate(geo.radians);
      ctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2, video.videoWidth, video.videoHeight);
      const cam = this._getEffectiveLiveCamera?.() || "camera";
      const safeName = String(cam).replace(/[^a-z0-9_.-]/gi, "_");
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${safeName}_${ts}.jpg`;
      canvas.toBlob((blob) => {
        // toBlob returns null when the canvas is tainted by a
        // cross-origin video. The empty-frame case is caught earlier
        // via the videoWidth check, so a null here is effectively
        // always a taint.
        if (!blob) {
          this._showSnapshotToast(TAINT_MSG);
          return;
        }
        const url = URL.createObjectURL(blob);
        try {
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          // No success toast — the download itself is the feedback.
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (err) {
          console.warn("[CGC] snapshot download failed:", err);
          this._showSnapshotToast("Download blocked — tap to open", url);
          // Keep the URL alive until the fallback toast hides.
          setTimeout(() => URL.revokeObjectURL(url), 6000);
        }
      }, "image/jpeg", 0.92);
    } catch (err) {
      // SecurityError fires synchronously on tainted-canvas drawImage in
      // some engines (Safari). Other engines defer to toBlob's null path.
      const isSecurity = err && (err.name === "SecurityError" || /tainted|cross-origin/i.test(String(err.message || "")));
      this._showSnapshotToast(isSecurity ? TAINT_MSG : "Snapshot failed");
      console.warn("[CGC] snapshot failed:", err);
    }
  }

  /**
   * In-card error toast for snapshot failures. Auto-hides after 4.5s.
   * The optional `href` argument makes the toast tappable — used for
   * the "open in tab" fallback when the browser refused the programmatic
   * download. Success cases never call this — the OS download is its
   * own feedback.
   */
  _showSnapshotToast(text, href) {
    this._snapshotToast = href ? { text, href } : { text };
    this.requestUpdate();
    if (this._snapshotToastTimer) clearTimeout(this._snapshotToastTimer);
    this._snapshotToastTimer = setTimeout(() => {
      this._snapshotToast = null;
      this._snapshotToastTimer = null;
      this.requestUpdate();
    }, 4500);
  }

  _renderSnapshotToast() {
    const t = this._snapshotToast;
    if (!t) return html``;
    const body = html`<span class="snapshot-toast-text">${t.text}</span>`;
    return html`
      <div class="snapshot-toast snapshot-toast--error" role="status" aria-live="polite">
        ${t.href
          ? html`<a class="snapshot-toast-link" href=${t.href} target="_blank" rel="noopener">${body}</a>`
          : body}
      </div>
    `;
  }

  _openVideoFullscreen() {
    const video = this._previewVideoEl;
    // The card overlay is the default; `gallery_fullscreen: video` opts in to
    // the platform player.
    const mode = galleryFullscreenTarget(this.config?.gallery_fullscreen, video, !!document.fullscreenEnabled);
    if (mode === "overlay") {
      this._openImageFullscreen();
      return;
    }
    this._videoFsWasPlaying = !video.paused;
    // .pimg blocks pointer events; the native controls need them.
    video.style.pointerEvents = "auto";
    video.controls = true;
    if (mode === "webkit") {
      video.webkitEnterFullscreen();
      return;
    }
    video.requestFullscreen().catch(() => {
      this._onVideoFullscreenExit(video);
      this._openImageFullscreen();
    });
  }

  _onVideoFullscreenExit(video) {
    video.controls = false;
    video.style.pointerEvents = "";
    const wasPlaying = this._videoFsWasPlaying;
    const exitedAt = performance.now();
    this._videoFsWasPlaying = false;
    // iPhone pauses after this event, not before it. Look again shortly.
    setTimeout(() => {
      if (!video.paused || video !== this._previewVideoEl) return;
      if (shouldResumeAfterExit(wasPlaying, this._videoLastPauseAt, exitedAt)) {
        video.play().catch(() => {});
      }
    }, 500);
  }

  _openImageFullscreen() {
    this._resetZoom();
    // Hand the clip's position to the overlay's own <video> so it continues
    // instead of restarting (applied on loadedmetadata, see _applyImgFsHandoff).
    this._imgFsHandoff = captureHandoff(this._previewVideoEl);
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
    this._resetZoom();
    this._handBackImgFsPlayback();
    this._imgFsOpen = false;
    if (this._onImgFsKeydown) {
      window.removeEventListener("keydown", this._onImgFsKeydown);
    }
    try { screen.orientation?.unlock?.(); } catch (_) {}
    this.requestUpdate();
  }

  // Continue the preview's playback in the overlay video (same clip only).
  _applyImgFsHandoff(video) {
    const handoff = this._imgFsHandoff;
    this._imgFsHandoff = null;
    if (!handoff || !sameMediaUrl(handoff.src, video.currentSrc || video.src, location.href)) return;
    const start = handoffStartTime(handoff, video.duration);
    if (start > 0) {
      try { video.currentTime = start; } catch (_) {}
    }
    video.playbackRate = handoff.rate;
    if (handoff.playing) video.play().catch(() => {});
    else video.pause();
  }

  // Closing the overlay: hand its position back to the preview video.
  _handBackImgFsPlayback() {
    this._imgFsHandoff = null;
    const overlay = this.renderRoot?.querySelector(".img-fs-overlay video");
    const preview = this._previewVideoEl;
    if (!overlay || !preview) return;
    if (!sameMediaUrl(overlay.currentSrc || overlay.src, preview.currentSrc || preview.src, location.href)) return;
    try { preview.currentTime = overlay.currentTime; } catch (_) {}
    preview.playbackRate = overlay.playbackRate;
    if (!overlay.paused && !overlay.ended) preview.play().catch(() => {});
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

  _applyLiveMuteState(forcePlay = false) {
    if (this._liveAudioSuspended || !this._liveCard || !this._isLiveActive()) return false;
    const { video, recovered, status } = syncLiveAudio(this._liveCard, this._liveMuted);
    const changed = video !== this._liveAudioLastVideo || video?.srcObject !== this._liveAudioLastStream;
    this._liveAudioLastVideo = video;
    this._liveAudioLastStream = video?.srcObject;
    this._liveAudioStatus = status;
    if (this._liveMuted) {
      this._liveAudioPlaybackError = "";
      this._liveAudioPlayAttempt++;
    }
    if (video && !this._liveMuted && (forcePlay || changed || recovered)) {
      const card = this._liveCard;
      const attempt = ++this._liveAudioPlayAttempt;
      this._liveAudioPlaybackError = "";
      try {
        Promise.resolve(video.play()).catch(() => {
          if (attempt !== this._liveAudioPlayAttempt || card !== this._liveCard || video !== this._liveAudioLastVideo || this._liveMuted) return;
          this._liveAudioPlaybackError = "Listening playback blocked; toggle the speaker to retry (browser autoplay policy)";
          this.requestUpdate();
        });
      } catch (_) {
        this._liveAudioPlaybackError = "Listening playback unavailable; toggle the speaker to retry";
      }
    }
    return true;
  }

  _syncLiveMuted(forcePlay = false) {
    if (!this._applyLiveMuteState(forcePlay)) return;
    if (this._liveAudioTimer) return;
    // Lifetime-bound polling also covers delayed shadow DOM, audio tracks and
    // HA reconnects. It never retains a PC or stream and is stopped at teardown.
    this._liveAudioTimer = setInterval(() => {
      if (!this._applyLiveMuteState()) {
        clearInterval(this._liveAudioTimer);
        this._liveAudioTimer = null;
      }
    }, 500);
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

  // Single place that turns the camera count into a tile layout, so the
  // grid mount and the preview's aspect-ratio can't drift apart.
  _getGridLayout(count) {
    const pinned = Number(this.config?.live_grid_columns) || 0;
    return gridLayout(count, {
      columns: pinned > 0 ? pinned : null,
      maxColumns: this._gridMaxCols,
      aspectRatio: this._aspectRatio || "16/9",
      emphasis: this.config?.live_grid_emphasis ?? null,
    });
  }

  // Cap the grid's automatic column count on narrow cards so tiles don't
  // shrink to postage stamps in a sidebar or on a phone. An explicit
  // live_grid_columns pin bypasses this — gridLayout ignores maxColumns
  // when a pin is set.
  _gridMaxColsForWidth(width) {
    if (!Number.isFinite(width) || width <= 0) return null;
    if (width < 400) return 2;
    if (width < 600) return 3;
    return null;
  }

  // Called from updated(), so it runs after every render. `.preview` is
  // conditionally rendered and can be replaced, hence the re-target check
  // rather than a one-shot start.
  _syncGridResizeObserver() {
    if (typeof ResizeObserver === "undefined") return;
    const target = this.renderRoot?.querySelector(".preview") || null;
    if (target === this._gridResizeTarget) return;

    if (this._gridResizeTimer) {
      clearTimeout(this._gridResizeTimer);
      this._gridResizeTimer = null;
    }
    if (this._gridResizeObserver) this._gridResizeObserver.disconnect();
    this._gridResizeTarget = target;
    if (!target) {
      this._gridResizeObserver = null;
      return;
    }

    this._gridResizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0;
      const next = this._gridMaxColsForWidth(width);
      if (next === this._gridMaxCols) return;
      // Debounce: a drag-resize fires this continuously, and every remount
      // re-lays-out each ha-camera-stream. The cap is applied inside the
      // timer so the preview's aspect-ratio and the grid tracks — both read
      // from _gridMaxCols — can never disagree mid-resize.
      if (this._gridResizeTimer) clearTimeout(this._gridResizeTimer);
      this._gridResizeTimer = setTimeout(() => {
        this._gridResizeTimer = null;
        if (next === this._gridMaxCols) return;
        this._gridMaxCols = next;
        if (!isGridLayout(this.config, this._liveLayoutOverride)) return;
        this.requestUpdate();
        this._mountLiveCard();
      }, 150);
    });
    this._gridResizeObserver.observe(target);
  }

  _stopGridResizeObserver() {
    if (this._gridResizeTimer) {
      clearTimeout(this._gridResizeTimer);
      this._gridResizeTimer = null;
    }
    if (this._gridResizeObserver) {
      this._gridResizeObserver.disconnect();
      this._gridResizeObserver = null;
    }
    this._gridResizeTarget = null;
  }

  // Sets a tile's grid span and its CSS `order` from the entity's current
  // index in `cameras`. Kept together because auto-placement needs both to
  // agree: `order` puts the tile in the right slot, span sizes it once
  // there. Never move the tile itself to reorder it — see _teardownLiveView
  // below for why ha-camera-stream can't tolerate being detached/reattached.
  _applyTileLayout(tile, idx, layout) {
    tile.style.setProperty("--cgc-tile-span", String(layout.tileSpans[idx] ?? 1));
    tile.style.order = String(idx);
  }

  async _mountLiveGrid() {
    if (!this._isLiveActive()) return;
    const host = this.renderRoot?.querySelector("#live-card-host");
    if (!host) return;

    const cameras = getGridCameraEntities(this.config);
    const layout = this._getGridLayout(cameras.length);

    if (!host.classList.contains("live-grid-host")) {
      host.classList.add("live-grid-host");
      host.innerHTML = "";
      this._liveGridTiles.clear();
    }
    host.style.setProperty("--cgc-grid-template-cols", layout.templateColumns);
    host.style.setProperty("--cgc-grid-template-rows", layout.templateRows);
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
        // Reused tiles stay put in the DOM even when `cameras` gets
        // reordered, so span alone can't fix placement — `_applyTileLayout`
        // also sets `order` to re-sort auto-placement without touching the DOM.
        this._applyTileLayout(existing, cameras.indexOf(entity), layout);
        this._applyTileRotation(existing, entity);
        continue;
      }

      const tile = document.createElement("div");
      tile.className = "live-grid-tile";
      tile.dataset.entity = entity;
      // New tiles are always appended at the end, so once older tiles are
      // out of position, DOM order alone won't match `cameras` order
      // either — `_applyTileLayout`'s `order` assignment fixes both cases.
      this._applyTileLayout(tile, cameras.indexOf(entity), layout);
      tile.addEventListener("click", () => this._onGridTileTap(entity));
      this._applyTileRotation(tile, entity);

      const stream = document.createElement("ha-camera-stream");
      stream.stateObj = this._hass?.states?.[entity];
      stream.hass = this._hass;
      stream.muted = true;
      stream.controls = false;
      stream.style.cssText = "display:block;width:100%;height:100%;object-fit:cover;";
      // HA's stream element sizes itself to 100% of its parent from inside
      // its own shadow root, so rotation goes on this wrapper instead.
      const wrap = document.createElement("div");
      wrap.className = "live-grid-stream";
      wrap.appendChild(stream);
      tile.appendChild(wrap);

      const label = document.createElement("div");
      label.className = "live-grid-label";
      label.textContent = this._friendlyCameraName(entity);
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

    const generation = this._liveViewGeneration;
    const effectiveCam = this._getEffectiveLiveCamera();
    const streamEntry = this._getStreamEntryById(effectiveCam);
    const isStreamUrl = !!streamEntry;
    const card = isStreamUrl
      ? await this._ensureLiveCardFromUrl(streamEntry.url)
      : await this._ensureLiveCard();
    if (!card || generation !== this._liveViewGeneration || !this._isLiveActive()) return;

    const isNewMount = card.parentElement !== host;

    if (isNewMount) {
      host.innerHTML = "";
      host.appendChild(card);
    }

    // Only update stateObj in entity mode
    if (!isStreamUrl) {
      const entity = this._getEffectiveLiveCamera();
      const newStateObj = this._hass?.states?.[entity];
      if (newStateObj?.last_changed !== card.stateObj?.last_changed) {
        card.stateObj = newStateObj;
      }
    }

    // Inject styles only on a new mount (timers + MutationObserver do the rest)
    if (isNewMount) {
      card.hass = this._hass;
      injectLiveFillStyle(card);
      this._liveMuted = this._recoveryMuted ?? (this.config?.live_auto_muted !== false);
      this._recoveryMuted = null;
      this._liveAudioSuspended = false;
      this._syncLiveMuted();
    }

    // Always re-run: `_setViewMode` resets `_aspectRatio` back to the
    // config value, even when the stream was pre-warmed and the video
    // already has intrinsic dimensions.
    this._setupAutoAspectRatio();
    this._startStreamWatch();
  }

  // Fully releases the live view: stops playback, closes WebRTC, detaches the
  // mounted card, and clears grid tiles. Safe to call when nothing is mounted.
  // Why: ha-camera-stream's disconnectedCallback handles its own tree, but the
  // URL-fast-path holds a PC + WS on `this` that won't close just by removing
  // the <video>, and `display:none` doesn't pause playback either — so a card
  // left mounted in media mode keeps streaming and audible (issue #109).
  _teardownLiveView({ preserveCardFullscreen = false } = {}) {
    this._liveViewGeneration++;
    const video = this._findLiveVideo();
    // A camera swap keeps the card host in fullscreen without exit/re-entry.
    // Descendant/native video fullscreen cannot survive removing that player.
    const keepFullscreen = preserveCardFullscreen && this._isLiveActive() &&
      !this.renderRoot?.fullscreenElement && !this.renderRoot?.webkitFullscreenElement &&
      !video?.webkitDisplayingFullscreen;
    if (!keepFullscreen) {
      // Genuine exit: invalidate any pending entry, and exit only fullscreen
      // this card owns — never another dashboard card's.
      this._cardFullscreenGeneration++;
      this._exitOwnedFullscreen(video);
      this._liveFallbackCleanup?.();
      this._liveFullscreen = false;
      this.removeAttribute("data-live-fs");
      this._resetZoom();
    }
    this._liveAudioSuspended = true;
    clearInterval(this._liveAudioTimer);
    this._liveAudioTimer = null;
    this._liveAudioLastVideo = null;
    this._liveAudioLastStream = null;
    this._liveAudioStatus = "Live audio inactive";
    this._liveAudioPlaybackError = "";
    this._liveAudioPlayAttempt++;
    if (this._autoAspectObs) {
      clearInterval(this._autoAspectObs);
      this._autoAspectObs = null;
    }
    this._autoAspectVideo = null;

    // Silence first; stop() can synchronously restore talkback's prior choice.
    if (video) {
      video.muted = true;
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

  // ─── Talkback bar (two-way audio) ─────────────────────────────────────
  //
  // Renders a glass-look bar pinned to the bottom of the live preview.
  // Renders for both toggle and ptt modes — the underlying handlers
  // branch on live_mic_mode. Only shown when the active camera has a
  // backchannel stream configured in `live_mic_streams`. Visual states:
  //   - idle      → outlined microphone-outline icon, theme tint
  //   - connecting→ spinning loading icon, orange tint
  //   - active    → solid microphone icon, red tint
  //   - error     → microphone-off icon, dark red tint; auto-clears
  //                 when the client's auto-clear timer fires (8 s)
  //
  // Tint and opacity for idle are sourced from `--cgc-talkback-bg` and
  // `--cgc-talkback-opacity` (configurable from the styling tab, with a
  // fallback to the global `--cgc-pill-bg` + `bar_opacity` so existing
  // themes look reasonable without extra config).
  //
  // The error message is rendered as a small toast inside the controls
  // bar (separate live region) so screen readers announce failures via
  // aria-live.
  // `inRow`: render as its own row below/above the preview (#257) rather
  // than floating over the video. Same control, flow layout and card colors.
  _renderMicTalkbackBar(inRow = false) {
    const cameraId = this._getEffectiveLiveCamera();
    const source = this._talkSourceFor(cameraId);
    if (!source) return html``;
    let state = this._micState;
    let err = this._micErrorCode;
    if (source === "native") {
      // HA's own two-way audio: state comes from the player, not the mic client.
      const ui = nativeTalkUiState(
        this._liveCardConfigKey === `webrtc:${cameraId}` ? this._nativeMicState : "off",
        { secureContext: window.isSecureContext !== false }
      );
      state = ui.state;
      err = ui.error;
    }
    const isPtt = this.config?.live_mic_mode === "ptt";
    const idleLabel = isPtt ? "Hold to talk" : "Tap to talk";
    const activeLabel = isPtt ? "Talking…" : "Talking… (tap to stop)";
    const errorLabel =
      source === "native" && err
        ? this._micErrorLabelForCode(err)
        : isPtt ? "Tap and hold to retry" : "Tap to retry";
    const label =
      state === "active"
        ? activeLabel
        : state === "connecting"
          ? "Connecting…"
          : err
            ? errorLabel
            : idleLabel;
    const icon =
      state === "active"
        ? "mdi:microphone"
        : state === "connecting"
          ? "mdi:loading"
          : err
            ? "mdi:microphone-off"
            : "mdi:microphone-outline";
    const cls =
      state === "active"
        ? "talkback-active"
        : state === "connecting"
          ? "talkback-connecting"
          : err
            ? "talkback-error"
            : "talkback-idle";
    // State-overrides override the configurable idle tint while the
    // backchannel is connecting/active/errored, so users always get
    // unambiguous feedback regardless of their idle styling.
    const bg =
      state === "active"
        ? "rgba(220, 38, 38, 0.30)"
        : state === "connecting"
          ? "rgba(202, 138, 4, 0.30)"
          : err
            ? "rgba(127, 29, 29, 0.30)"
            : inRow
              ? "var(--cgc-obj-btn-bg, var(--cgc-ui-bg))"
              : "transparent";
    // Avoid stacking on top of the pill bar — when pills sit at the
    // bottom (`bar_position: bottom`) flip the talkback bar to the top.
    const placement =
      this.config?.bar_position === "bottom"
        ? "top:12px;bottom:auto"
        : "bottom:12px;top:auto";

    // Shape: full-width bar (default) or compact round button. The button
    // shares the bar's tint, blur and state colors so themes carry over;
    // only the geometry and visible label differ.
    const shape = this.config?.live_mic_shape === "button" ? "button" : "bar";
    const isButton = shape === "button";

    let position;
    if (inRow) {
      position = isButton ? "" : "width:100%";
    } else if (isButton) {
      const pos = this.config?.live_mic_button_position;
      if (pos === "left") position = "left:12px;right:auto;transform:none";
      else if (pos === "right") position = "left:auto;right:12px;transform:none";
      else position = "left:50%;right:auto;transform:translateX(-50%)";
    } else {
      position = "left:12px;right:12px";
    }

    const sizeStyle = isButton
      ? "width:44px;height:44px;padding:0;border-radius:50%;gap:0;"
      : "min-height:38px;height:38px;padding:0 16px;border-radius:14px;gap:10px;";

    const ariaLabel = isButton
      ? `${label} (${state})`
      : `Push-to-talk (${state})`;

    // Round button uses expanding radar rings (not the bar's waveform) as the
    // "talking" indicator — they emanate past the user's fingertip during
    // push-to-talk, so feedback stays visible while the button is pressed.
    // Needs overflow:visible so the rings aren't clipped to the 44px circle;
    // they paint before the tint so the on-button portion reads as a glow.
    const overflow = isButton ? "visible" : "hidden";
    const radarRings =
      isButton && state === "active"
        ? html`
            <span class="mic-talkback-ring" aria-hidden="true"></span>
            <span class="mic-talkback-ring" aria-hidden="true" style="animation-delay:0.66s;"></span>
            <span class="mic-talkback-ring" aria-hidden="true" style="animation-delay:1.33s;"></span>
          `
        : html``;

    return html`
      <div
        class="mic-talkback-bar mic-talkback-${shape} ${cls}"
        role="button"
        tabindex="0"
        aria-label=${ariaLabel}
        title=${isButton ? label : ""}
        style="${inRow
          ? `position:relative;${position};box-sizing:border-box;color:var(--cgc-txt);border-radius:var(--cgc-obj-btn-radius, 10px);`
          : `position:absolute;${position};${placement};color:#fff;backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);text-shadow:0 1px 2px rgba(0,0,0,0.5);box-shadow:inset 0 1px 0 rgba(255,255,255,0.14);`}${sizeStyle}${inRow && !isButton ? "border-radius:var(--cgc-obj-btn-radius, 10px);" : ""}font-size:14px;display:flex;align-items:center;justify-content:center;font-weight:600;letter-spacing:0.02em;background:${bg};user-select:none;-webkit-user-select:none;touch-action:none;z-index:5;overflow:${overflow};"
        @pointerdown=${this._onMicPointerDown}
        @pointerup=${this._onMicPointerUp}
        @pointercancel=${this._onMicPointerUp}
        @pointerleave=${this._onMicPointerUp}
      >
        ${radarRings}
        <span class="mic-talkback-tint" aria-hidden="true" style="${inRow ? "display:none;" : ""}position:absolute;inset:0;border-radius:inherit;background:var(--cgc-talkback-bg, var(--cgc-pill-bg, #000));opacity:calc(var(--cgc-talkback-opacity, var(--cgc-bar-opacity, 30)) / 100);pointer-events:none;"></span>
        ${isButton || this.config?.live_mic_waveform_enabled === false ? html`` : html`<canvas class="mic-wave" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;opacity:${state === "active" ? 1 : 0};transition:opacity 150ms ease-out;pointer-events:none;z-index:1;"></canvas>`}
        <ha-icon icon=${icon} style="--mdc-icon-size:${isButton ? 22 : 18}px;width:${isButton ? 22 : 18}px;height:${isButton ? 22 : 18}px;display:inline-flex;align-items:center;justify-content:center;line-height:1;position:relative;z-index:2;"></ha-icon>
        ${isButton ? html`` : html`<span style="position:relative;z-index:2;">${label}</span>`}
      </div>
    `;
  }

  // Live-region toast for mic errors. Sits inside the live-controls-bar so
  // it doesn't shift the rest of the page. role=status + aria-live=polite
  // lets screen readers announce the failure without interrupting other
  // focus.
  _startMicWaveLoop() {
    if (this._micWaveRaf) return;
    // Feature gate — silently noop when the user has turned the visualiser off.
    if (this.config?.live_mic_waveform_enabled === false) return;
    // Reduced-motion users: skip the animating waveform — the existing
    // typed visual states (idle/connecting/active/error) already convey
    // mic state without continuous motion.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const tick = () => {
      const canvas = this.renderRoot?.querySelector("canvas.mic-wave");
      if (!canvas || this._micState !== "active") {
        this._stopMicWaveLoop();
        return;
      }
      this._drawMicWaveFrame(canvas);
      this._micWaveRaf = requestAnimationFrame(tick);
    };
    this._micWaveRaf = requestAnimationFrame(tick);
  }

  _stopMicWaveLoop() {
    if (this._micWaveRaf) {
      cancelAnimationFrame(this._micWaveRaf);
      this._micWaveRaf = null;
    }
    const canvas = this.renderRoot?.querySelector("canvas.mic-wave");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // ─── Talkback waveform rendering ─────────────────────────────────────────
  //
  // Hard-coded as frequency-bars; sensitivity is the only knob (low/medium/
  // high → 2.0/3.5/5.5 gain through a tanh soft-clip). Opacity is fixed at
  // 35% which reads well over the standard talkback-bar tint.

  _drawMicWaveFrame(canvas) {
    wfDrawFrame(canvas, {
      sensitivity: this.config?.live_mic_waveform_sensitivity ?? "medium",
      freqBuf: this._micFreqBuf,
      getFreq: (buf) => this._micClient.getFrequencyData(buf),
    });
  }

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
  // ─── HA two-way audio (2026.11) ────────────────────────────────

  /** "go2rtc", "native" or null: which backchannel the talk button uses. */
  _talkSourceFor(cameraId) {
    return talkSource({
      cameraId,
      go2rtcStream: String(micStreamForCamera(cameraId, this.config) || ""),
      nativeSupported: this._nativeTalkSupported(cameraId),
      nativeEnabled: this.config?.live_native_talk,
    });
  }

  /** Whether HA reports two-way audio for `cameraId`; fetched once per camera. */
  _nativeTalkSupported(cameraId) {
    const id = String(cameraId || "");
    if (!id.startsWith("camera.") || this.config?.live_native_talk === false) return false;
    const cached = this._nativeTalkCaps.get(id);
    if (cached !== undefined) return cached === true;
    if (!this._hass?.callWS) return false;
    this._nativeTalkCaps.set(id, "pending");
    this._hass
      .callWS({ type: "camera/capabilities", entity_id: id })
      .then((caps) => this._nativeTalkCaps.set(id, caps?.two_way_audio === true))
      .catch(() => this._nativeTalkCaps.set(id, false))
      .finally(() => this.requestUpdate());
    return false;
  }

  _onNativeTalkPointer(phase) {
    if (window.isSecureContext === false) return; // the button already says HTTPS is needed
    const player = this._liveCard;
    if (!player?.toggleMicrophone) return;
    const toggle = nativeTalkShouldToggle({
      phase,
      mode: this.config?.live_mic_mode ?? "toggle",
      mic: this._nativeMicState,
    });
    if (toggle) Promise.resolve(player.toggleMicrophone()).catch(() => undefined);
  }

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

  _renderPtzOverlay() {
    if (!this._ptzActive) return html``;
    const cameraId = this._getEffectiveLiveCamera();
    const ptz = getPtzConfig(this.config, cameraId);
    if (!ptz) return html``;
    const caps = ptzCapabilities(ptz);
    const baseSize = PTZ_JOY_BASE_SIZE;
    const thumbSize = PTZ_JOY_THUMB_SIZE;
    // Resolved corner with auto-flip for bar-position conflicts. The DOM
    // order is always joystick → zoom → home; we flip horizontally via
    // `flex-direction: row-reverse` for right-corners so the joystick
    // visually sits closest to the camera edge.
    const pos = resolvePtzPosition(this.config);
    const [vAnchor, hAnchor] = pos.split("-"); // [bottom|top, left|right]
    const flexDir = hAnchor === "right" ? "row-reverse" : "row";
    const containerStyle = `position:absolute;${vAnchor}:12px;${hAnchor}:12px;display:flex;flex-direction:${flexDir};align-items:${vAnchor === "top" ? "flex-start" : "flex-end"};gap:6px;z-index:6;`;
    const maxThumbOffset = (baseSize - thumbSize) / 2;
    const thumb = this._ptzJoystickThumb || { x: 0, y: 0 };
    // `active` = user is currently driving the joystick (drag in progress
    // or a keyboard direction held). Drives the visual pulse on the
    // thumb so it's clear the command is registering.
    const joystickActive = this._ptzJoystickPointerId !== null || !!this._ptzHoldDirection;
    return html`
      <!-- PTZ container — joystick + zoom-capsule + home, anchored in
           the configured corner. Flex-direction flips for right-corners
           so the joystick (first child) stays closest to the edge. -->
      <div class="ptz-block" style=${containerStyle}>
      <!-- Virtual joystick. Outer ring is the base; the inner disc is the
           thumb the user drags. Cardinal pan resolves from the thumb
           angle; magnitude is forwarded to dispatchers that honour speed
           (ONVIF). Snaps back on release. -->
      <div
        class="ptz-joystick"
        style="position:relative;width:${baseSize}px;height:${baseSize}px;border-radius:50%;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;"
        @pointerdown=${(e) => { e.stopPropagation(); this._onPtzJoystickStart(e, maxThumbOffset); }}
        @pointermove=${(e) => { e.stopPropagation(); this._onPtzJoystickMove(e, maxThumbOffset); }}
        @pointerup=${(e) => { e.stopPropagation(); this._onPtzJoystickEnd(e); }}
        @pointercancel=${(e) => { e.stopPropagation(); this._onPtzJoystickEnd(e); }}
        @pointerleave=${(e) => { e.stopPropagation(); this._onPtzJoystickEnd(e); }}
        @contextmenu=${(e) => e.preventDefault()}
      >
        <!-- glass-uniform base ring -->
        <span aria-hidden="true" style="position:absolute;inset:0;border-radius:inherit;background:var(--cgc-pill-bg, #000);opacity:calc(var(--cgc-bar-opacity, 30) / 100);box-shadow:inset 0 1px 0 rgba(255,255,255,0.14);backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);pointer-events:none;"></span>
        <!-- thumb disc: position lives in inline transform so the render
             layer can smooth-snap it back on release via a CSS transition. -->
        <div
          class="ptz-joystick-thumb"
          style="position:absolute;left:50%;top:50%;width:${thumbSize}px;height:${thumbSize}px;margin:-${thumbSize / 2}px 0 0 -${thumbSize / 2}px;border-radius:50%;background:${joystickActive ? "var(--primary-color, #03a9f4)" : "rgba(255,255,255,0.92)"};box-shadow:${joystickActive ? "0 0 0 4px rgba(3,169,244,0.28), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.5)" : "0 2px 6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.6)"};transform:translate(${thumb.x}px, ${thumb.y}px);transition:${this._ptzJoystickPointerId === null ? "transform 0.18s ease-out, background 0.12s ease, box-shadow 0.12s ease" : "background 0.12s ease, box-shadow 0.12s ease"};pointer-events:none;"
        ></div>
      </div>

      ${caps.zoomable
        ? html`
            <!-- Zoom capsule: single glass pill split by a thin divider
                 (ACC-inspired, not a copy — single background and rounded
                 corners shared between in/out so the pair reads as one
                 control instead of two stacked pills). -->
            <div
              class="ptz-zoom-capsule"
              style="position:relative;width:34px;height:${baseSize}px;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:inset 0 1px 0 rgba(255,255,255,0.14);backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);"
            >
              <span aria-hidden="true" style="position:absolute;inset:0;border-radius:inherit;background:var(--cgc-pill-bg, #000);opacity:calc(var(--cgc-bar-opacity, 30) / 100);pointer-events:none;"></span>
              <button
                class="ptz-zoom-btn"
                type="button"
                aria-label="Zoom in"
                title="Zoom in"
                @pointerdown=${(e) => { e.stopPropagation(); this._onPtzActionPress("zoom_in", e); }}
                @pointerup=${(e) => { e.stopPropagation(); this._onPtzActionRelease("zoom_in", e); }}
                @pointerleave=${(e) => { e.stopPropagation(); this._onPtzActionRelease("zoom_in", e); }}
                @pointercancel=${(e) => { e.stopPropagation(); this._onPtzActionRelease("zoom_in", e); }}
                style="position:relative;flex:1;width:100%;display:flex;align-items:center;justify-content:center;border:0;color:#fff;background:${this._ptzHoldAction === "zoom_in" ? "rgba(3,169,244,0.35)" : "transparent"};cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;transition:background 0.12s ease;"
              >
                <ha-icon icon="mdi:magnify-plus-outline" style="--mdc-icon-size:18px;width:18px;height:18px;position:relative;z-index:1;text-shadow:0 1px 2px rgba(0,0,0,0.5);"></ha-icon>
              </button>
              <!-- divider — picks up the icon-shadow vibe but as a hairline -->
              <span aria-hidden="true" style="position:relative;z-index:1;height:1px;background:rgba(255,255,255,0.18);pointer-events:none;"></span>
              <button
                class="ptz-zoom-btn"
                type="button"
                aria-label="Zoom out"
                title="Zoom out"
                @pointerdown=${(e) => { e.stopPropagation(); this._onPtzActionPress("zoom_out", e); }}
                @pointerup=${(e) => { e.stopPropagation(); this._onPtzActionRelease("zoom_out", e); }}
                @pointerleave=${(e) => { e.stopPropagation(); this._onPtzActionRelease("zoom_out", e); }}
                @pointercancel=${(e) => { e.stopPropagation(); this._onPtzActionRelease("zoom_out", e); }}
                style="position:relative;flex:1;width:100%;display:flex;align-items:center;justify-content:center;border:0;color:#fff;background:${this._ptzHoldAction === "zoom_out" ? "rgba(3,169,244,0.35)" : "transparent"};cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;transition:background 0.12s ease;"
              >
                <ha-icon icon="mdi:magnify-minus-outline" style="--mdc-icon-size:18px;width:18px;height:18px;position:relative;z-index:1;text-shadow:0 1px 2px rgba(0,0,0,0.5);"></ha-icon>
              </button>
            </div>
          `
        : html``}

      ${caps.homeable
        ? html`
            <!-- Home: own rounded-square button next to the zoom capsule,
                 same glass treatment, slightly smaller so it doesn't
                 compete with the joystick as the dominant element. -->
            <button
              class="ptz-home"
              type="button"
              aria-label="Home"
              title="Home"
              @pointerdown=${(e) => e.stopPropagation()}
              @click=${(e) => { e.stopPropagation(); this._onPtzHome(); }}
              style="position:relative;width:34px;height:${baseSize}px;border-radius:14px;border:0;color:#fff;background:transparent;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 1px 0 rgba(255,255,255,0.14);backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);cursor:pointer;overflow:hidden;"
            >
              <span aria-hidden="true" style="position:absolute;inset:0;border-radius:inherit;background:${this._ptzHomePressed ? "rgba(3,169,244,0.45)" : "var(--cgc-pill-bg, #000)"};opacity:${this._ptzHomePressed ? "1" : "calc(var(--cgc-bar-opacity, 30) / 100)"};transition:background 0.12s ease, opacity 0.12s ease;pointer-events:none;"></span>
              <ha-icon icon="mdi:home-outline" style="--mdc-icon-size:18px;width:18px;height:18px;position:relative;z-index:1;text-shadow:0 1px 2px rgba(0,0,0,0.5);"></ha-icon>
            </button>
          `
        : html``}
      </div>
    `;
  }

  _togglePtz() {
    this._ptzActive = !this._ptzActive;
    // Always tear down a running hold-repeat when leaving PTZ mode —
    // a pointer that's still down (or an arrow key) would otherwise keep
    // the camera moving forever, and for continuous-types would leave a
    // service in motion indefinitely.
    if (!this._ptzActive) {
      this._stopPtzHold();
    }
  }

  // Visibility / focus failsafe: if the user backgrounds the tab while a
  // PTZ button is still pressed, the pointerup never lands on the card.
  // For continuous-types that would leave the camera spinning until the
  // tab returns. Always halt.
  _onPtzVisibilityChange = () => {
    if (document.visibilityState !== "visible" && this._ptzHoldDirection) {
      this._stopPtzHold();
    }
  };

  // Effective speed for a pan/zoom call: per-camera override from
  // `live_ptz_cameras.*.speed`, falling back to the global
  // `live_ptz_speed`, falling back to 5. Pulse-type dispatchers ignore
  // the value entirely; continuous-types (ONVIF) scale it to their own
  // range.
  _currentPtzSpeed(ptz) {
    if (ptz && Number.isFinite(ptz.speed)) return ptz.speed;
    const g = this.config?.live_ptz_speed;
    return Number.isFinite(g) ? g : 5;
  }

  // One pan call in a given direction + phase. Pulse-types ignore the
  // `stop` phase at the service layer (no integration support); the card
  // still calls `stop` for symmetry so future continuous-types can hook in
  // without an index.js change.
  //
  // When `_ptzJoystickMagnitude` is non-zero (a joystick drag is driving
  // the press, not a discrete button tap), scale `globalSpeed` by it. That
  // gives ONVIF a true analog speed dial — closer to centre = slower pan.
  // Pulse-types ignore the value, so the override is harmless for EZVIZ.
  _ptzPanCall(direction, phase, resolvedPtz) {
    const cameraId = this._getEffectiveLiveCamera();
    const ptz = resolvedPtz ?? getPtzConfig(this.config, cameraId);
    if (!ptz || !this._hass || !cameraId) return;
    let effectiveSpeed = this._currentPtzSpeed(ptz);
    if (Number.isFinite(this._ptzJoystickMagnitude) && this._ptzJoystickMagnitude > 0) {
      // Floor at 1 so a near-centre but past-deadzone drag still moves.
      effectiveSpeed = Math.max(1, Math.round(this._ptzJoystickMagnitude * PTZ_SPEED_MAX));
    }
    // Secondary axis is the joystick's "other" component when both are
    // pulled past their dead-zone. ONVIF picks this up for diagonal pan;
    // other dispatchers ignore it. Only relevant on phase:"start" — stop
    // is a single call regardless.
    let secondary = null;
    if (phase === "start" && this._ptzJoystickAxes) {
      const { horizontal, vertical } = this._ptzJoystickAxes;
      if (direction === "left" || direction === "right") {
        if (vertical) secondary = vertical;
      } else if (horizontal) {
        secondary = horizontal;
      }
    }
    ptzDispatchPan(
      this._hass,
      cameraId,
      ptz,
      direction,
      phase,
      effectiveSpeed,
      secondary
    ).catch((err) => {
      try { console.warn("CGC PTZ pan failed:", err); } catch (_) {}
    });
  }

  // Press handler for a pan direction. Driven by the joystick wrapper —
  // shaped as a reusable entry point so direction-button UIs could plug
  // in unchanged. Lifecycle:
  //   1. Capture the pointer so dragging off the source still routes
  //      pointerup back to it — otherwise the repeat loop leaks.
  //   2. If a *different* direction was already held (slide-from-◀-to-▶
  //      without releasing), issue a clean stop on the old direction
  //      first, then start the new one. Continuous-types would race two
  //      motions otherwise; pulse-types just want the latest direction.
  //   3. Fire `phase: "start"` once.
  //   4. For pulse-types only (EZVIZ today), set up a 250 ms repeat
  //      timer. Continuous-types skip this — the integration keeps the
  //      motor going until `phase: "stop"`.
  //
  // 250 ms is picked from earlier tuning: EZVIZ's `button.press` triggers
  // a ~1 s cloud-side pulse; re-firing well before that finishes keeps
  // the motor going without obvious stop-and-start jitter.
  _onPtzPress(direction, ev) {
    if (this._ptzHoldDirection && this._ptzHoldDirection !== direction) {
      this._stopPtzHold();
    }
    this._ptzHaptic(ev);
    try { ev?.currentTarget?.setPointerCapture?.(ev.pointerId); } catch (_) {}
    this._ptzHoldDirection = direction;
    this._ptzHoldPointerId = ev?.pointerId ?? null;
    const cameraId = this._getEffectiveLiveCamera();
    const ptz = getPtzConfig(this.config, cameraId);
    this._ptzPanCall(direction, "start", ptz);
    const continuous = ptz ? ptzCapabilities(ptz).continuous : false;
    if (this._ptzHoldTimer) clearInterval(this._ptzHoldTimer);
    if (!continuous) {
      this._ptzHoldTimer = setInterval(() => {
        if (!this._ptzHoldDirection) return;
        this._ptzPanCall(this._ptzHoldDirection, "start");
      }, 250);
    }
  }

  // Named-action (zoom_in / zoom_out) press handler. Same press-and-hold
  // semantics as direction buttons. For zoom: continuous types treat stop
  // as the same `move_mode: Stop` / `frigate.ptz action:stop` call shared
  // with pan, so we route via `_stopPtzHold` regardless of which action
  // was held.
  _onPtzActionPress(action, ev) {
    const cameraId = this._getEffectiveLiveCamera();
    const ptz = getPtzConfig(this.config, cameraId);
    if (!ptz || !this._hass || !cameraId) return;
    if (this._ptzHoldDirection || this._ptzHoldAction) this._stopPtzHold();
    this._ptzHaptic(ev);
    try { ev?.currentTarget?.setPointerCapture?.(ev.pointerId); } catch (_) {}
    this._ptzHoldAction = action;
    this._ptzHoldPointerId = ev?.pointerId ?? null;
    const speed = this._currentPtzSpeed(ptz);
    ptzDispatchAction(this._hass, cameraId, ptz, action, "start", speed).catch((err) => {
      try { console.warn("CGC PTZ zoom failed:", err); } catch (_) {}
    });
    const continuous = ptzCapabilities(ptz).continuous;
    if (this._ptzHoldTimer) clearInterval(this._ptzHoldTimer);
    if (!continuous) {
      this._ptzHoldTimer = setInterval(() => {
        if (!this._ptzHoldAction) return;
        ptzDispatchAction(this._hass, cameraId, ptz, this._ptzHoldAction, "start", speed).catch(
          () => {}
        );
      }, 250);
    }
  }

  _onPtzActionRelease(_action, ev) {
    if (
      ev?.pointerId !== undefined &&
      this._ptzHoldPointerId !== null &&
      ev.pointerId !== this._ptzHoldPointerId
    ) {
      return;
    }
    try { ev?.currentTarget?.releasePointerCapture?.(ev.pointerId); } catch (_) {}
    this._stopPtzHold();
  }

  // Virtual joystick: pointerdown on the base, drag the thumb, release
  // to snap back. Each pointer frame:
  //   1. Compute direction + magnitude via `joystickResolve`.
  //   2. If direction changed (or moved out of dead-zone), route through
  //      `_onPtzPress` — that handler already does the stop-then-start
  //      dance for continuous-types and tracks the polling interval for
  //      pulse-types. No new dispatch path required.
  //   3. If direction is null (thumb back in dead-zone mid-drag), tear
  //      down the current hold so the camera stops moving.
  //   4. Update `_ptzJoystickThumb` (clamped to the base circle) so the
  //      thumb-disc visually follows the finger.
  // Geometry is captured once at pointerdown — the joystick element doesn't
  // move during a drag, and `getBoundingClientRect()` forces a layout flush
  // that we'd otherwise pay on every pointermove frame.
  _ptzJoystickGeometryFrom(target) {
    if (!target?.getBoundingClientRect) return null;
    const rect = target.getBoundingClientRect();
    return {
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      r: Math.min(rect.width, rect.height) / 2,
    };
  }

  _onPtzJoystickStart(ev, maxOffset) {
    const g = this._ptzJoystickGeometryFrom(ev?.currentTarget);
    if (!g) return;
    this._ptzJoystickPointerId = ev?.pointerId ?? null;
    this._ptzJoystickGeom = g;
    try { ev.currentTarget?.setPointerCapture?.(ev.pointerId); } catch (_) {}
    this._onPtzJoystickUpdate(ev, g, maxOffset);
  }

  _onPtzJoystickMove(ev, maxOffset) {
    if (this._ptzJoystickPointerId === null) return;
    if (ev.pointerId !== this._ptzJoystickPointerId) return;
    const g = this._ptzJoystickGeom;
    if (!g) return;
    this._onPtzJoystickUpdate(ev, g, maxOffset);
  }

  _onPtzJoystickEnd(ev) {
    if (this._ptzJoystickPointerId === null) return;
    if (ev?.pointerId !== undefined && ev.pointerId !== this._ptzJoystickPointerId) return;
    try { ev?.currentTarget?.releasePointerCapture?.(ev.pointerId); } catch (_) {}
    this._ptzJoystickPointerId = null;
    this._ptzJoystickGeom = null;
    this._ptzJoystickThumb = { x: 0, y: 0 };
    this._ptzJoystickMagnitude = null;
    this._ptzJoystickAxes = null;
    this._stopPtzHold();
    this.requestUpdate();
  }

  // Recompute direction + thumb position from a pointer event. Shared by
  // start and move so the lifecycle stays consistent (initial press is
  // treated identically to mid-drag).
  _onPtzJoystickUpdate(ev, g, maxOffset) {
    const { direction, horizontal, vertical, magnitude } = joystickResolve(
      g.cx,
      g.cy,
      g.r,
      ev.clientX ?? g.cx,
      ev.clientY ?? g.cy
    );
    // Track magnitude + per-axis components before any dispatch so
    // `_ptzPanCall` reads the up-to-date values — both for the initial
    // press and for mid-drag moves that don't switch direction but do
    // change how hard or which way the user is pulling.
    this._ptzJoystickMagnitude = direction ? magnitude : null;
    this._ptzJoystickAxes = direction ? { horizontal, vertical } : null;
    if (!direction) {
      // Thumb back inside dead-zone — halt any active hold but stay in
      // joystick capture mode so subsequent moves resume cleanly.
      if (this._ptzHoldDirection || this._ptzHoldAction) this._stopPtzHold();
    } else if (direction !== this._ptzHoldDirection) {
      this._onPtzPress(direction, ev);
    }
    // Clamp thumb to the base circle minus half the thumb radius so the
    // disc never leaves the ring. Round to integer pixels — sub-pixel
    // jitter from the touch driver would otherwise force a re-render on
    // every frame even when the user's finger is parked.
    const dx = (ev.clientX ?? g.cx) - g.cx;
    const dy = (ev.clientY ?? g.cy) - g.cy;
    const dist = Math.hypot(dx, dy);
    let nx, ny;
    if (dist <= maxOffset || dist === 0) {
      nx = Math.round(dx);
      ny = Math.round(dy);
    } else {
      const k = maxOffset / dist;
      nx = Math.round(dx * k);
      ny = Math.round(dy * k);
    }
    const prev = this._ptzJoystickThumb;
    if (!prev || prev.x !== nx || prev.y !== ny) {
      this._ptzJoystickThumb = { x: nx, y: ny };
      this.requestUpdate();
    }
  }

  // Home is a one-shot (no press-and-hold). The dispatcher ignores
  // phase:"stop" for home, so we only emit start.
  _onPtzHome() {
    const cameraId = this._getEffectiveLiveCamera();
    const ptz = getPtzConfig(this.config, cameraId);
    if (!ptz || !this._hass || !cameraId) return;
    this._ptzHaptic(null);
    // Brief "just pressed" highlight — Home is one-shot so we can't key
    // the visual off a held-state. 220 ms matches the eye's perception
    // threshold for a confirmed tap.
    this._ptzHomePressed = true;
    if (this._ptzHomePressedTimer) clearTimeout(this._ptzHomePressedTimer);
    this._ptzHomePressedTimer = setTimeout(() => {
      this._ptzHomePressed = false;
      this._ptzHomePressedTimer = null;
      this.requestUpdate();
    }, 220);
    this.requestUpdate();
    const speed = this._currentPtzSpeed(ptz);
    ptzDispatchAction(this._hass, cameraId, ptz, "home", "start", speed).catch((err) => {
      try { console.warn("CGC PTZ home failed:", err); } catch (_) {}
    });
  }

  // Tear-down shared between pointerup, direction-switch, togglePtz-off,
  // visibilitychange and disconnectedCallback. Always fires a `stop` phase
  // call so continuous-types halt cleanly — for both pan and zoom.
  _stopPtzHold() {
    if (this._ptzHoldTimer) {
      clearInterval(this._ptzHoldTimer);
      this._ptzHoldTimer = null;
    }
    const heldDir = this._ptzHoldDirection;
    const heldAction = this._ptzHoldAction;
    this._ptzHoldDirection = null;
    this._ptzHoldAction = null;
    this._ptzHoldPointerId = null;
    if (heldDir) this._ptzPanCall(heldDir, "stop");
    if (heldAction) {
      const cameraId = this._getEffectiveLiveCamera();
      const ptz = getPtzConfig(this.config, cameraId);
      if (ptz && this._hass && cameraId) {
        const speed = this._currentPtzSpeed(ptz);
        ptzDispatchAction(this._hass, cameraId, ptz, heldAction, "stop", speed).catch(() => {});
      }
    }
  }

  _renderGalleryPillById(id, ctx) {
    switch (id) {
      case "object_indicator": {
        const obj = this._objectForSrc(ctx.selected);
        const icon = obj ? objectIcon(obj, this._customIcons, "mdi:magnify") : null;
        if (!icon) return null;
        return html`<div class="gallery-pill live-pill-btn gallery-pill--info">
          <ha-icon icon="${icon}"></ha-icon>
        </div>`;
      }

      case "index_counter":
        return html`<div class="gallery-pill live-pill-btn gallery-pill--wide gallery-pill--info">
          <span>${ctx.idx + 1}/${ctx.filtered.length}</span>
        </div>`;

      case "autoplay_all": {
        const active = !!this._galleryAutoplayAll;
        return html`
          <button
            class="gallery-pill live-pill-btn ${active ? "active" : ""}"
            title=${active ? "Stop auto-play" : "Auto-play all clips"}
            aria-pressed=${active ? "true" : "false"}
            @pointerdown=${(e) => e.stopPropagation()}
            @click=${(e) => { e.stopPropagation(); this._toggleAutoplayAll(); this._showPills(); }}
          >
            <ha-icon icon="mdi:playlist-play"></ha-icon>
          </button>
        `;
      }

      case "playback_speed": {
        if (!ctx.selectedIsVideo) return null;
        const sp = this._galleryPlaybackSpeed || 1;
        const label = sp === 0.5 ? ".5×" : sp === 2 ? "2×" : "1×";
        return html`
          <button
            class="gallery-pill live-pill-btn ${sp !== 1 ? "active" : ""}"
            title="Playback speed (tap to cycle)"
            @pointerdown=${(e) => e.stopPropagation()}
            @click=${(e) => { e.stopPropagation(); this._cyclePlaybackSpeed(); this._showPills(); }}
          >
            <span class="vid-speed-label">${label}</span>
          </button>
        `;
      }

      case "mute":
        if (!ctx.selectedIsVideo) return null;
        return html`
          <button
            class="gallery-pill live-pill-btn"
            @pointerdown=${(e) => e.stopPropagation()}
            @click=${(e) => {
              e.stopPropagation();
              this._toggleGalleryMute();
            }}
          >
            <ha-icon icon=${this._galleryMuted ? "mdi:volume-off" : "mdi:volume-high"}></ha-icon>
          </button>
        `;

      case "pip": {
        if (!ctx.selectedIsVideo) return null;
        if (!document.pictureInPictureEnabled) return null;
        const active = !!this._galleryPipActive;
        return html`
          <button
            class="gallery-pill live-pill-btn ${active ? "active" : ""}"
            title="Picture-in-Picture"
            aria-pressed=${active ? "true" : "false"}
            @pointerdown=${(e) => e.stopPropagation()}
            @click=${(e) => {
              e.stopPropagation();
              this._toggleGalleryPip();
            }}
          >
            <ha-icon icon="mdi:picture-in-picture-bottom-right"></ha-icon>
          </button>
        `;
      }

      case "fullscreen":
        if (!(ctx.selectedHasUrl && !ctx.noResultsForFilter)) return null;
        return html`
          <button
            class="gallery-pill live-pill-btn"
            @pointerdown=${(e) => e.stopPropagation()}
            @click=${(e) => {
              e.stopPropagation();
              if (ctx.selectedIsVideo) this._openVideoFullscreen();
              else this._openImageFullscreen();
            }}
          >
            <ha-icon icon="mdi:fullscreen"></ha-icon>
          </button>
        `;

      case "video_time":
        // Rendered as a floating bottom-right overlay, not inside the
        // pill row — see the video-controls block in the preview
        // template. Listed in the catalog purely for the on/off toggle.
        return null;

      default:
        return null;
    }
  }

  _renderLivePillById(id) {
    switch (id) {
      case "mute":
        return html`<button class="gallery-pill live-pill-btn" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._toggleLiveMute(); }}>
          <ha-icon icon=${this._liveMuted ? "mdi:volume-off" : "mdi:volume-high"}></ha-icon>
        </button>`;

      case "picker":
        if (this._getLiveCameraOptions().length <= 1) return null;
        return html`<button class="gallery-pill live-pill-btn" title="Switch camera" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._openLivePicker(); }}>
          <ha-icon icon="mdi:cctv"></ha-icon>
        </button>`;

      case "pip": {
        if (!document.pictureInPictureEnabled) return null;
        const active = !!this._livePipActive;
        return html`<button class="gallery-pill live-pill-btn ${active ? "active" : ""}" title="Picture-in-Picture" aria-pressed=${active ? "true" : "false"} @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._toggleLivePip(); }}>
          <ha-icon icon="mdi:picture-in-picture-bottom-right"></ha-icon>
        </button>`;
      }

      case "fullscreen":
        return html`<button class="gallery-pill live-pill-btn" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._toggleLiveFullscreen(); }}>
          <ha-icon icon=${document.fullscreenElement || document.webkitFullscreenElement || this._liveFullscreen ? "mdi:fullscreen-exit" : "mdi:fullscreen"}></ha-icon>
        </button>`;

      case "snapshot":
        return html`<button class="gallery-pill live-pill-btn" title="Snapshot" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._captureLiveSnapshot(); }}>
          <ha-icon icon="mdi:camera"></ha-icon>
        </button>`;

      case "refresh":
        return html`<button class="gallery-pill live-pill-btn" title="Refresh stream" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._refreshLiveStream(); }}>
          <ha-icon icon="mdi:refresh"></ha-icon>
        </button>`;

      default:
        return null;
    }
  }

  _renderLiveInner() {
    // Grid mode renders its own tiles into `#live-card-host` imperatively;
    // the single-camera path (offline placeholder + live picker stage)
    // doesn't apply there. Without this short-circuit, going single →
    // grid while the active camera is unavailable leaves the offline
    // placeholder showing on top of the grid until the next page-render.
    if (isGridLayout(this.config, this._liveLayoutOverride)) return html``;
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
        // The camera picker lives in the live stage, which an offline camera
        // replaces; render it here too so you can still switch away from a
        // camera that is offline.
        const picUrl = "";
        return html`
          <div class="live-offline">
            ${picUrl ? html`<img class="live-offline-img" src="${picUrl}" alt="" />` : html``}
            <div class="live-offline-badge">
              <ha-icon icon="mdi:camera-off"></ha-icon>
              <span>${this._friendlyCameraName(entity)}</span>
              <span class="live-offline-state">Offline</span>
            </div>
            ${this._renderLivePicker()}
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

  /**
   * Hybrid-mode side drawer. Renders only when the view mode is "hybrid"
   * and there are clips to show. The drawer body is the same filtered
   * list the gallery uses — object filters / type filter / favorites all
   * apply identically so the two views stay in sync.
   *
   * Open/close: tap the CLIPS edge-toggle, click the scrim, or (desktop)
   * hover the edge for ~350ms with `_scheduleHybridHoverOpen`.
   *
   * @param {ReadonlyArray<{src:string, dtMs?:number|null}>} clips
   *   Filtered list from the gallery pipeline.
   */
  _renderHybridDrawer(clips, days = [], currentDay = null) {
    if (!this._isHybridActive()) return html``;
    const isOpen = this._hybridDrawerOpen;
    // Cap at a sane number — drawer is scrollable so the user can reach
    // older clips. 50 keeps memory + DOM sensible for typical NVRs.
    const list = Array.isArray(clips) ? clips.slice(0, 50) : [];
    // Day filter: a dropdown listing all available days (newest-first).
    const dayList = Array.isArray(days) ? days : [];
    // Meta bar (time + object icon under each thumb) shrinks ONLY when the
    // drawer is narrower than the 50% default — never grows past it. `shrink`
    // ramps 0→1 as the width drops 50%→25%; widths ≥50% keep full size.
    const w = this._hybridDrawerWidthPct ?? 50;
    const shrink = Math.max(0, Math.min(1, (50 - w) / 25));
    const metaFs = (11 - shrink * 3).toFixed(1);
    const objSz = (15 - shrink * 4).toFixed(1);
    const drawerStyle = `width:${w}%;--cgc-hyb-meta-fs:${metaFs}px;--cgc-hyb-obj-sz:${objSz}px`;
    // Always-visible chevron toggle. The fully-transparent edge zone we
    // had before was unreliable on iOS (mirroring ACC #801: hover-only
    // triggers can passthrough taps to whatever element happens to be
    // underneath). A visible toggle is a clear target on touch and still
    // pairs well with desktop hover.
    const isHoverable = typeof window !== "undefined" && window.matchMedia?.("(hover: hover)")?.matches;
    return html`
      ${isOpen
        ? html`<div
            class="hybrid-scrim"
            @pointerdown=${(e) => e.stopPropagation()}
            @pointerup=${(e) => e.stopPropagation()}
            @click=${(e) => {
              e.stopPropagation();
              this._closeHybridDrawer();
            }}
          ></div>`
        : html``}
      <button type="button"
              class="hybrid-edge-toggle ${isOpen ? "open" : ""}"
              aria-label=${isOpen ? "Close clips drawer" : "Open clips drawer"}
              @pointerdown=${(e) => e.stopPropagation()}
              @click=${(e) => { e.stopPropagation(); this._cancelHybridHoverOpen(); this._toggleHybridDrawer(); }}
              @mouseenter=${() => {
                if (!isHoverable) return;
                this._cancelHybridHoverClose();
                if (!this._hybridDrawerOpen) this._scheduleHybridHoverOpen();
              }}
              @mouseleave=${() => this._cancelHybridHoverOpen()}>
        <span class="hybrid-edge-label">CLIPS</span>
      </button>
      <div class="hybrid-drawer ${isOpen ? "open" : ""}"
           style=${drawerStyle}
           @pointerdown=${(e) => e.stopPropagation()}
           @mouseenter=${() => this._cancelHybridHoverClose()}
           @pointerleave=${(e) => { if (e.pointerType === "mouse" && this._hybridDrawerOpen && !this._hybridResizing) this._scheduleHybridHoverClose(); }}>
        <div class="hybrid-resize ${this._hybridResizing ? "resizing" : ""}"
             @pointerdown=${(e) => this._startHybridResize(e)}
             @click=${(e) => e.stopPropagation()}></div>
        <div class="hybrid-day-filter">
          ${this._hybridClipOpen ? html`
            <button type="button" class="hybrid-drawer-live"
              @pointerdown=${(e) => e.stopPropagation()}
              @click=${(e) => { e.stopPropagation(); this._returnToLiveFromHybrid(); this._closeHybridDrawer(); }}>
              <ha-icon class="hybrid-live-arrow" icon="mdi:arrow-left"></ha-icon>LIVE
            </button>
          ` : html``}
          ${dayList.length ? html`
            <button type="button" class="hybrid-day-btn ${this._hybridDayMenuOpen ? "on" : ""}"
              aria-label="Choose a day"
              @pointerdown=${(e) => e.stopPropagation()}
              @click=${(e) => { e.stopPropagation(); this._toggleHybridDayMenu(); }}>
              <ha-icon icon="mdi:calendar-month"></ha-icon>
            </button>
          ` : html``}
          <div class="hybrid-layout-toggle">
            <button type="button" class="hyb-lt ${this._hybridLayout === "list" ? "on" : ""}"
              aria-label="Lijst (grote thumbnails)"
              @pointerdown=${(e) => e.stopPropagation()}
              @click=${(e) => { e.stopPropagation(); this._setHybridLayout("list"); }}>
              <ha-icon icon="mdi:view-agenda"></ha-icon>
            </button>
            <button type="button" class="hyb-lt ${this._hybridLayout === "grid" ? "on" : ""}"
              aria-label="Grid (compact, meerdere kolommen)"
              @pointerdown=${(e) => e.stopPropagation()}
              @click=${(e) => { e.stopPropagation(); this._setHybridLayout("grid"); }}>
              <ha-icon icon="mdi:view-grid"></ha-icon>
            </button>
          </div>
          ${dayList.length && this._hybridDayMenuOpen ? html`
            <div class="hybrid-day-menu">
              ${dayList.map((d) => html`
                <button type="button" class="hybrid-day-item ${d === currentDay ? "on" : ""}"
                  @pointerdown=${(e) => e.stopPropagation()}
                  @click=${(e) => { e.stopPropagation(); this._selectHybridDay(d); }}>
                  <span>${formatDay(d, this._hass?.locale)}</span>
                  ${d === currentDay ? html`<ha-icon icon="mdi:check"></ha-icon>` : html``}
                </button>
              `)}
            </div>
          ` : html``}
        </div>
        ${dayList.length && currentDay
          ? html`<div class="hybrid-date-row">
              <span class="hybrid-date-num">${formatDayNumeric(currentDay, this._hass?.locale)}</span>
            </div>`
          : html``}
        <div class="hybrid-drawer-body ${this._hybridLayout === "grid" ? "is-grid" : ""}">
            ${list.length === 0
              ? html`<div class="hybrid-drawer-empty">No clips for the current filter.</div>`
              : list.map((c) => {
                  const time = this._formatHybridTime?.(c.dtMs) || "";
                  const obj = this._objectForSrc?.(c.src);
                  const objIcon = obj ? objectIcon(obj, this._customIcons, "mdi:magnify") : null;
                  const objColor = obj ? objectColor(obj, this.config?.object_colors ?? {}) : null;
                  // Frigate event cluster: a head clip standing in for several
                  // back-to-back events. Show a count badge that expands the
                  // members (already injected into `list` by the cluster helper).
                  const isMs =
                    (this.config?.source_mode === "media" ||
                      this.config?.source_mode === "combined") &&
                    isMediaSourceId(c.src);
                  const clusterMeta = isMs ? this._mediaClient?.getClusterMeta?.(c.src) : null;
                  const isCluster = !!clusterMeta && clusterMeta.count > 1;
                  const isExpanded = isCluster && this._expandedClusters?.has(c.src);
                  return html`
                    <button type="button"
                            class="hybrid-clip ${c._clusterMember ? "cluster-member" : ""}"
                            data-hybrid-clip="${c.src}"
                            @click=${(e) => { e.stopPropagation(); this._onHybridClipClick(c.src); }}>
                      <div class="hybrid-clip-thumb">
                        ${this._renderHybridClipThumb?.(c) || html``}
                      </div>
                      <div class="hybrid-clip-meta">
                        <span class="hybrid-clip-time">${time}</span>
                        ${isCluster
                          ? html`<button
                              type="button"
                              class="hybrid-clip-cluster ${isExpanded ? "open" : ""}"
                              title="${clusterMeta.count} events — ${isExpanded ? "inklappen" : "uitvouwen"}"
                              @pointerdown=${(e) => e.stopPropagation()}
                              @click=${(e) => { e.stopPropagation(); this._toggleClusterExpand(c.src); }}>
                              ${clusterMeta.count}×<ha-icon icon="mdi:chevron-down"></ha-icon>
                            </button>`
                          : html``}
                        ${objIcon
                          ? html`<ha-icon
                              class="hybrid-clip-obj"
                              icon="${objIcon}"
                              title="${obj}"
                              style=${objColor ? `color:${objColor}` : ""}
                            ></ha-icon>`
                          : html``}
                      </div>
                    </button>
                  `;
                })}
          </div>
        </div>
    `;
  }

  _openHybridDrawer() {
    this._cancelHybridHoverOpen();
    this._cancelHybridHoverClose();
    if (this._hybridDrawerOpen) return;
    this._hybridDrawerOpen = true;
    this.requestUpdate();
  }

  // Desktop hover-to-open with a short delay so brushing past the edge toggle
  // doesn't fling the drawer open; cancelled on mouseleave before it fires.
  _scheduleHybridHoverOpen() {
    if (this._hybridDrawerOpen || this._hybridHoverTimer) return;
    this._hybridHoverTimer = setTimeout(() => {
      this._hybridHoverTimer = null;
      if (!this._hybridDrawerOpen) this._openHybridDrawer();
    }, 350);
  }

  _cancelHybridHoverOpen() {
    if (this._hybridHoverTimer) {
      clearTimeout(this._hybridHoverTimer);
      this._hybridHoverTimer = null;
    }
  }

  // Symmetric to open: brief grace period before closing so users can dart
  // between the drawer and the CLIPS edge-toggle without losing the drawer.
  _scheduleHybridHoverClose() {
    if (!this._hybridDrawerOpen || this._hybridCloseTimer || this._hybridResizing) return;
    this._hybridCloseTimer = setTimeout(() => {
      this._hybridCloseTimer = null;
      if (this._hybridDrawerOpen && !this._hybridResizing) this._closeHybridDrawer();
    }, 350);
  }

  _cancelHybridHoverClose() {
    if (this._hybridCloseTimer) {
      clearTimeout(this._hybridCloseTimer);
      this._hybridCloseTimer = null;
    }
  }

  _toggleHybridDrawer() {
    if (this._hybridDrawerOpen) this._closeHybridDrawer();
    else this._openHybridDrawer();
  }

  _closeHybridDrawer() {
    this._cancelHybridHoverClose();
    if (!this._hybridDrawerOpen) return;
    this._hybridDrawerOpen = false;
    this._hybridDayMenuOpen = false;
    this.requestUpdate();
  }

  _onHybridClipClick(src) {
    if (!src) return;
    // Play the clip in-place over the live view: stay in "hybrid" viewMode
    // (so the gallery toolbar + thumb strip stay hidden) but flip
    // `_hybridClipOpen` so the preview renders the selected clip as media.
    // The drawer closes; the "← Live" button returns to the feed.
    const { items } = this._currentFilteredItems();
    // Match the render path: the preview resolves `_selectedIndex` against the
    // cluster-injected list, so expanded cluster members are only findable here
    // once their members are spliced in too.
    const list = this._injectExpandedClusterMembers(items);
    const idx = list.findIndex((it) => it.src === src);
    if (idx < 0) return;
    this._selectedIndex = idx;
    this._previewOpen = true;
    this._hybridClipOpen = true;
    // Stop the live stream — a hidden live card keeps streaming AND audible
    // (display:none doesn't pause playback, see _teardownLiveView / #109), so
    // without this you'd hear live audio under the clip. updated() re-mounts
    // it when we return (isLive flips back to true).
    this._teardownLiveView();
    this._closeHybridDrawer();
    this.requestUpdate();
  }

  _returnToLiveFromHybrid() {
    if (!this._hybridClipOpen) return;
    this._hybridClipOpen = false;
    // Stop the clip player before the live feed remounts (updated() handles
    // the live remount once isLive flips true).
    this._clearPreviewVideoHostPlayback();
    this._showPills?.(2500);
    this.requestUpdate();
  }

  _toggleHybridDayMenu() {
    this._hybridDayMenuOpen = !this._hybridDayMenuOpen;
    this.requestUpdate();
  }

  _setHybridLayout(mode) {
    if (mode !== "grid" && mode !== "list") return;
    if (this._hybridLayout === mode) return;
    this._hybridLayout = mode;
    try {
      localStorage.setItem("cgc_hybrid_layout", mode);
    } catch (_) { /* localStorage unavailable */ }
    this.requestUpdate();
  }

  // Drag the left edge of the right-anchored drawer to resize its width.
  // Width is a % of the preview box so it scales with the card; everything
  // inside is %/flex-based so it reflows for free. rAF-throttled to keep the
  // drag smooth on a big component.
  _startHybridResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const preview = this.renderRoot?.querySelector(".preview");
    if (!preview) return;
    const rect = preview.getBoundingClientRect();
    if (!rect.width) return;
    this._hybridResizing = true;
    let raf = 0;
    let pct = this._hybridDrawerWidthPct ?? 50;
    const apply = () => {
      raf = 0;
      this._hybridDrawerWidthPct = pct;
      this.requestUpdate();
    };
    const move = (ev) => {
      pct = Math.max(25, Math.min(85, ((rect.right - ev.clientX) / rect.width) * 100));
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const up = () => {
      if (raf) cancelAnimationFrame(raf);
      this._hybridDrawerWidthPct = pct;
      this._hybridResizing = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      this.requestUpdate();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  _selectHybridDay(day) {
    this._hybridDayMenuOpen = false;
    if (!day || day === this._selectedDay) {
      this.requestUpdate();
      return;
    }
    // Switch the day the drawer lists, mirroring the date-picker's reset so
    // the filtered list + any later gallery view stay consistent.
    this._selectedDay = day;
    this._selectedIndex = 0;
    this._pendingScrollToI = null;
    this._forceThumbReset = true;
    this.requestUpdate();
  }

  _formatHybridTime(dtMs) {
    if (!dtMs || !Number.isFinite(dtMs)) return "";
    const d = new Date(dtMs);
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    if (sameDay) return `${hh}:${mm}`;
    const dd = String(d.getDate()).padStart(2, "0");
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mo} ${hh}:${mm}`;
  }

  /** Heuristic for the "subtle slide-in animation" on new clips: a clip
   * counts as recently added when the pipeline's rev incremented since
   * the last hybrid render and this src was not in the previous list. */
  _renderHybridClipThumb(it) {
    // Mirror the gallery thumb's poster lookup so the drawer benefits
    // from the same cache and resolution work. `it` is a `{src, dtMs?}`
    // entry, identical to what the thumbs strip iterates.
    const src = typeof it === "string" ? it : (it?.src || "");
    if (!src) return html`<div class="hybrid-clip-img placeholder" aria-hidden="true"></div>`;
    // Mark the clip as "revealed" so resolveVideoPoster will enqueue a
    // capture for sensor-mode video items. Without this the gallery's
    // IntersectionObserver gate fails (no thumbs strip mounted in
    // hybrid mode → posters never get captured on mobile-first sessions).
    if (this._revealedThumbs && !this._revealedThumbs.has(src)) {
      this._revealedThumbs.add(src);
    }
    const usingMediaSource =
      this.config?.source_mode === "media" || this.config?.source_mode === "combined";
    const isMs = usingMediaSource && isMediaSourceId(src);

    let thumbUrl = src;
    let tThumb = "";
    let tMime = "";
    let tCls = "";
    let tTitle = "";
    if (isMs) {
      thumbUrl = this._mediaClient?.getUrlCache?.()?.get?.(src) || "";
      const meta = this._mediaClient?.getMetaById?.(src) || {};
      tMime = meta.mime || "";
      tCls = meta.cls || "";
      tTitle = meta.title || "";
      tThumb = meta.thumb || "";
    }

    const isVid = this._isVideoSmart(thumbUrl || tTitle, tMime, tCls);

    let poster = isVid
      ? this._posterClient?.resolveVideoPoster?.(it, isMs, thumbUrl, tThumb, this._pendingPoster) || ""
      : thumbUrl;

    if (!isVid && !poster && isMs && tThumb) {
      poster = this._posterClient?.getPosterUrl?.(tThumb) || "";
      if (!poster) this._posterClient?.enqueue?.(tThumb);
    }

    if (poster) {
      return html`<img class="hybrid-clip-img" src=${poster} alt=""
        @error=${() => this._posterClient?.onThumbImgError?.(poster)} />`;
    }
    // No resolved poster yet → clean placeholder. The async poster pipeline
    // fills the real thumbnail in on `onChange`. (We deliberately do NOT fall
    // back to the live camera's entity_picture: it's the wrong image and its
    // proxy token expires, which rendered broken "?" tiles for older clips.)
    return html`<div class="hybrid-clip-img placeholder" aria-hidden="true"></div>`;
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

      <div class="live-picker cam-picker" @click=${(e) => e.stopPropagation()}>
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

    // Full teardown of the current card before swapping cameras: URL→entity
    // transitions otherwise leak the previous PC/WS, since _ensureLiveCard
    // doesn't know to close them. Keep card fullscreen while replacing media.
    this._teardownLiveView({ preserveCardFullscreen: true });
    this._resetStreamWatch();
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
    // Normalize to one of three modes; anything unknown falls back to gallery.
    let mode;
    if (nextMode === "live") mode = "live";
    else if (nextMode === "hybrid") mode = "hybrid";
    else mode = "media";

    const needsLive = mode === "live" || mode === "hybrid";
    if (needsLive && !this._hasLiveConfig()) return;

    // Manual navigation away from gallery outranks the deep-link's pending
    // newest-clip selection — don't let a late item load yank the user back
    // into gallery state they've already left.
    if (mode !== "media") this._pendingUrlGallerySelectNewest = false;

    const wasLive = this._viewMode === "live" || this._viewMode === "hybrid";
    this._viewMode = mode;

    if (needsLive && navigator.maxTouchPoints > 0) {
      this._showPills(5000);
    }

    // Tear down live infra only when leaving live AND hybrid entirely.
    if (!needsLive) {
      this._showLivePicker = false;
      this._resetZoom();
      this._aspectRatio = this._parseAspectRatio(this.config?.aspect_ratio);
      if (wasLive) this._teardownLiveView();
    }

    this.requestUpdate();
  }

  _onPreviewClick(e) {
    if (!this._isLiveActive()) return;

    const path = e.composedPath?.() || [];
    if (
      this._pathHasClass(path, "live-picker") ||
      this._pathHasClass(path, "live-picker-backdrop")
    ) return;

    // Hybrid: clicking the live area (anywhere outside the drawer)
    // dismisses the drawer. Clicks inside the drawer bubble up too, but
    // the path check keeps them from closing it.
    if (this._hybridDrawerOpen) {
      const insideDrawer =
        this._pathHasClass(path, "hybrid-drawer") ||
        this._pathHasClass(path, "hybrid-edge");
      if (!insideDrawer) {
        this._closeHybridDrawer();
        return;
      }
    }

    if (this._hamburgerOpen && !this._pathHasClass(path, "live-hamburger-wrap")) {
      this._closeLiveMenu();
      return;
    }

    this._runTapAction(path);
  }

  // Fires `tap_action` (HA action syntax) for a tap on the single-camera live
  // preview. Returns true when an action consumed the tap. Taps on pills / nav
  // buttons keep their own behaviour, and grid tiles keep "tap to focus".
  _runTapAction(path) {
    const cfg = this.config?.tap_action;
    if (!cfg || !cfg.action || cfg.action === "none") return false;
    if (this.config?.live_layout === "grid" && this._liveLayoutOverride !== "single") return false;
    if (
      this._pathHasClass(path, "gallery-pill") ||
      this._pathHasClass(path, "pnavbtn") ||
      this._pathHasClass(path, "pnav") ||
      this._pathHasClass(path, "live-hamburger-wrap")
    ) return false;

    if (cfg.confirmation) {
      const text = (typeof cfg.confirmation === "object" && cfg.confirmation.text) || "Are you sure?";
      if (!window.confirm(text)) return true;
    }

    const hass = this._hass;
    const entity = cfg.entity || this._liveSelectedCamera;
    switch (cfg.action) {
      case "more-info":
        if (!entity) return false;
        this.dispatchEvent(new CustomEvent("hass-more-info", {
          bubbles: true, composed: true, detail: { entityId: entity },
        }));
        return true;
      case "toggle":
        if (!entity) return false;
        hass?.callService("homeassistant", "toggle", { entity_id: entity });
        return true;
      case "perform-action":
      case "call-service": {
        const svc = cfg.perform_action || cfg.service;
        if (!svc || !svc.includes(".")) return false;
        const [domain, name] = svc.split(".");
        hass?.callService(domain, name, { ...(cfg.data || cfg.service_data || {}) }, cfg.target);
        return true;
      }
      case "navigate":
        if (!cfg.navigation_path) return false;
        if (cfg.navigation_replace) history.replaceState(null, "", cfg.navigation_path);
        else history.pushState(null, "", cfg.navigation_path);
        window.dispatchEvent(new CustomEvent("location-changed", {
          detail: { replace: !!cfg.navigation_replace },
        }));
        return true;
      case "url":
        // Refuse script-bearing schemes; http(s) and relative paths only.
        if (!cfg.url_path || /^\s*(javascript|data|vbscript):/i.test(cfg.url_path)) return false;
        window.open(cfg.url_path, "_blank", "noopener,noreferrer");
        return true;
      case "fullscreen":
        this._toggleLiveFullscreen();
        return true;
      case "snapshot":
        this._captureLiveSnapshot();
        return true;
      case "refresh":
        this._refreshLiveStream();
        return true;
      default:
        return false;
    }
  }

  // ─── Live menu buttons (menu_buttons) ─────────────────────────────

  // A `placement: controls` menu button among the live pills (#215, #286).
  // The wrap class keeps an open option list from closing on its tap.
  _renderControlMenuButton(btn) {
    if (!btn) return null;
    const { isOn, icon, bg, label } = this._menuButtonView(btn);
    return html`
      <div class="live-hamburger-wrap" @pointerdown=${(e) => e.stopPropagation()}>
        <button
          class="gallery-pill live-pill-btn ${isOn ? "active" : ""}"
          title="${label}"
          aria-label="${label}"
          style="${bg ? `background:${bg}` : ""}"
          @click=${(e) => { e.stopPropagation(); this._onMenuButtonTap(btn); }}
        >
          <ha-icon icon="${icon}"></ha-icon>
        </button>
      </div>
    `;
  }

  /** Display state for one `menu_buttons` entry. */
  _menuButtonView(btn) {
    const state = this._hass?.states?.[btn.entity];
    const isOn = isMenuButtonOn(btn, state);
    return {
      isOn,
      icon: isOn && btn.icon_on ? btn.icon_on : btn.icon,
      bg: isOn ? btn.color_on || "" : btn.color_off || "",
      label: menuButtonLabel(btn, state, this._hass),
    };
  }

  /** Tap on a menu button: call its service, or open its option list (#215). */
  _onMenuButtonTap(btn) {
    const tap = menuButtonTap(btn, this._hass?.states?.[btn.entity]);
    if (tap.kind === "select") {
      const alreadyOpen = this._hamburgerOpen && this._menuSelectEntity === btn.entity;
      if (alreadyOpen) {
        this._closeLiveMenu();
        return;
      }
      this._menuSelectEntity = btn.entity;
      this._hamburgerOpen = true;
      this._showPills();
      this.requestUpdate();
      return;
    }
    const { domain, service, data } = tap.call;
    this._hass?.callService(domain, service, data);
  }

  _pickMenuSelectOption(entityId, option) {
    const { domain, service, data } = selectOptionCall(entityId, option);
    this._hass?.callService(domain, service, data);
    this._closeLiveMenu();
  }

  _closeLiveMenu() {
    this._hamburgerOpen = false;
    this._menuSelectEntity = null;
    this._showPills(2500);
  }

  _toggleLiveMode() {
    if (!this._hasLiveConfig()) return;

    if (this._isLiveActive()) {
      this._setViewMode("media");
      this._showLivePicker = false;
      return;
    }

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

    // User-defined `thumb_actions` (#243) follow the built-ins, in config order.
    const custom = Array.isArray(this.config?.thumb_actions) ? this.config.thumb_actions : [];
    custom.forEach((cfg, i) => {
      if (!cfg?.name || !cfg?.perform_action) return;
      actions.push({
        icon: cfg.icon || "mdi:gesture-tap-button",
        id: `custom:${i}`,
        label: cfg.name,
      });
    });
    return actions;
  }

  // Runs one user-defined `thumb_actions` entry for `item`, with `url` the
  // item's resolved (browser-reachable) URL. See src/data/thumb-actions.ts.
  async _runCustomThumbAction(cfg, item, url) {
    const call = buildThumbActionCall(cfg, thumbActionContext(item.src, url));
    if (!call || !this._hass) return;

    const confirmText = thumbActionConfirmText(cfg);
    if (confirmText && !window.confirm(confirmText)) return;

    try {
      await this._hass.callService(call.domain, call.service, call.data, call.target);
      this.dispatchEvent(new CustomEvent("hass-notification", {
        bubbles: true, composed: true, detail: { message: `${cfg.name}: done` },
      }));
    } catch (err) {
      this._showErrorToast(`${cfg.name} failed`, String(err?.message || err || "Unknown error"));
    }
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
      // Playback URLs aren't always files (#204): Frigate clips resolve to an
      // HLS playlist, so fetch the integration's clip.mp4 instead, and don't
      // save a bare playlist for other stream-only sources.
      const target = resolveDownloadTarget(item.src, url);
      if (target.kind === "stream") {
        this._showErrorToast(
          "Download not available",
          "This source only provides a stream (HLS), not a video file to save."
        );
        return;
      }
      await this._downloadSrc(target.url, target.filename);
      return;
    }

    if (actionId.startsWith("custom:")) {
      const cfg = this.config?.thumb_actions?.[Number(actionId.slice("custom:".length))];
      this._closeThumbMenu();
      if (cfg) await this._runCustomThumbAction(cfg, item, url);
    }
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
    // Abort any in-flight swipe gesture: snap the thumb back, clear state.
    if (this._thumbSwipeEl) {
      const el = this._thumbSwipeEl;
      el.classList.remove("swiping");
      el.style.removeProperty("--swipe-dx");
      el.style.removeProperty("--swipe-progress");
    }
    this._thumbSwipeEl = null;
    this._thumbSwipeItem = null;
    this._thumbSwipeActive = false;
    this._thumbSwipeDx = 0;
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

    // Touch swipe-to-delete: start tracking only on touch pointers and only
    // when the item is actually delete-eligible — for everything else (mouse,
    // read-only Frigate items without rest_command, etc.) we don't even arm
    // the gesture, so the existing tap/click flow is untouched.
    if (e.pointerType === "touch" && this._thumbCanDelete(item)) {
      this._thumbSwipeEl = e.currentTarget;
      this._thumbSwipeItem = item;
      this._thumbSwipeStartX = e.clientX ?? 0;
      this._thumbSwipeStartY = e.clientY ?? 0;
      this._thumbSwipeDx = 0;
      this._thumbSwipeActive = false;
    }
  }

  _onThumbPointerMove(e) {
    if (this._thumbLongPressTimer) {
      const dxAbs = Math.abs((e.clientX ?? 0) - this._thumbLongPressStartX);
      const dyAbs = Math.abs((e.clientY ?? 0) - this._thumbLongPressStartY);
      if (dxAbs > THUMB_LONG_PRESS_MOVE_PX || dyAbs > THUMB_LONG_PRESS_MOVE_PX) {
        this._clearThumbLongPress();
      }
    }

    if (!this._thumbSwipeEl) return;
    const dx = (e.clientX ?? 0) - this._thumbSwipeStartX;
    const dy = (e.clientY ?? 0) - this._thumbSwipeStartY;

    if (!this._thumbSwipeActive) {
      // Decide direction once: if user is clearly swiping left, lock into
      // swipe mode; if they're scrolling vertically, abandon.
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        this._thumbSwipeEl = null;
        this._thumbSwipeItem = null;
        this._thumbSwipeActive = false;
        this._thumbSwipeDx = 0;
        return;
      }
      if (dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        this._thumbSwipeActive = true;
        this._suppressNextThumbClick = true; // don't open the item after a release
      } else {
        return;
      }
    }

    const clamped = Math.max(THUMB_SWIPE_MAX, Math.min(0, dx));
    this._thumbSwipeDx = clamped;
    const progress = Math.min(1, Math.abs(clamped) / THUMB_SWIPE_COMMIT);
    this._thumbSwipeEl.style.setProperty("--swipe-dx", `${clamped}px`);
    this._thumbSwipeEl.style.setProperty("--swipe-progress", progress.toFixed(3));
    this._thumbSwipeEl.classList.add("swiping");
    e.preventDefault?.();
  }

  _onThumbPointerUp() {
    this._clearThumbLongPress();

    if (this._thumbSwipeEl && this._thumbSwipeActive) {
      const el = this._thumbSwipeEl;
      const item = this._thumbSwipeItem;
      const committed = this._thumbSwipeDx <= THUMB_SWIPE_COMMIT;
      this._thumbSwipeEl = null;
      this._thumbSwipeItem = null;
      this._thumbSwipeActive = false;
      this._thumbSwipeDx = 0;

      if (committed) {
        // Swap to the .swipe-off class so CSS handles the slide-off
        // transition. Inline CSS vars get cleared so the class's transform
        // wins.
        el.classList.remove("swiping");
        el.classList.add("swipe-off");
        el.style.removeProperty("--swipe-dx");
        el.style.removeProperty("--swipe-progress");
        try { navigator.vibrate?.(15); } catch (_) {}
        setTimeout(() => this._handleSwipeDelete(item, el), 220);
      } else {
        // Snap back: clearing inline vars + removing the .swiping class
        // returns the thumb to its resting transform with the default
        // transition.
        el.classList.remove("swiping");
        el.style.removeProperty("--swipe-dx");
        el.style.removeProperty("--swipe-progress");
      }
    } else if (this._thumbSwipeEl) {
      this._thumbSwipeEl = null;
      this._thumbSwipeItem = null;
      this._thumbSwipeActive = false;
      this._thumbSwipeDx = 0;
    }
  }

  async _handleSwipeDelete(item, el) {
    if (!item?.src) return;
    // deleteItem() handles the confirm prompt itself when config.delete_confirm
    // is set, so we just await the pipeline. If the user cancels (or the
    // service call fails), we reset the visual so the thumb pops back in.
    await this._deleteSingle(item.src);
    if (el && el.isConnected) {
      el.classList.remove("swiping", "swipe-off");
      el.style.removeProperty("--swipe-dx");
      el.style.removeProperty("--swipe-progress");
    }
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
    const eventId = frigateEventIdFromSrc(src);
    const isFrigate = eventId !== null && isFrigateRoot(src);

    // Run the confirm here (not inside deleteItem) so a Cancel is a silent
    // no-op — otherwise deleteItem returns false for both "user cancelled"
    // and "service call failed" and the caller can't tell them apart.
    if (this.config?.delete_confirm) {
      const msg = isFrigate
        ? "Delete this Frigate event?"
        : "Are you sure you want to delete this file?";
      if (!window.confirm(msg)) return;
    }

    const ok = await deleteItem({
      hass: this._hass,
      src,
      config: this.config,
      srcEntityMap: this._sensorClient.getSrcEntityMap(),
      confirm: () => true,
    });
    if (!ok) {
      // Surface the failure via an in-card toast instead of swallowing it
      // silently — otherwise the user taps Delete, nothing happens, and they
      // have no idea why.
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

  async _downloadSrc(urlOrPath, filename) {
    if (!urlOrPath) return;

    const url = String(urlOrPath);
    const name = filename || filenameFromUrl(url);

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

      // Restart the observer after the scroll reset so visible elements
      // are detected at the new scroll position
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
      getObjectsForSrc: (s) => this._objectsForSrc(s),
    });
  }

  /** Primary detected object for `src` (badge icon/colour), or null. */
  _objectForSrc(src) {
    return this._objectsForSrc(src)[0] ?? null;
  }

  /** Every detected object for `src`, memoized per src (see `_objectCache`). */
  _objectsForSrc(src) {
    const key = String(src || "").trim();
    if (!key) return [];
    if (this._objectCache.has(key)) return this._objectCache.get(key);

    const detected = detectObjectsForSrc({
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

  /**
   * Open / close the inline mini-strip of cluster members for a
   * representative thumb. Triggered by the count-badge click.
   */
  _toggleClusterExpand(repSrc) {
    if (!repSrc) return;
    if (this._expandedClusters.has(repSrc)) this._expandedClusters.delete(repSrc);
    else this._expandedClusters.add(repSrc);
    this.requestUpdate();
  }

  /**
   * Splice members of currently-expanded clusters into a filtered item list,
   * right after the representative. Each member becomes a regular gallery
   * item with its own `i` index, so click → viewer works through the same
   * code path as any other thumb. Cluster members carry a marker flag so
   * the thumb render can style them differently.
   */
  _injectExpandedClusterMembers(filteredList) {
    if (!this._expandedClusters?.size) return filteredList;
    const out = [];
    for (const item of filteredList) {
      out.push(item);
      if (!this._expandedClusters.has(item.src)) continue;
      const meta = this._mediaClient?.getClusterMeta?.(item.src);
      if (!meta?.members?.length) continue;
      for (const m of meta.members) {
        if (m.id === item.src) continue;
        out.push({ src: m.id, dtMs: m.dtMs, _clusterMember: true });
      }
    }
    return out;
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
      this._pathHasClass(path, "live-picker-backdrop")
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
      // Don't toggle when the tap landed on an actual control — its own
      // click handler should fire and the pills should stay visible so
      // the user can keep interacting. _showPills() resets the timer.
      const path = e.composedPath?.() || [];
      const onControl =
        this._pathHasClass(path, "gallery-pill") ||
        this._pathHasClass(path, "pnavbtn") ||
        this._pathHasClass(path, "pnav") ||
        this._pathHasClass(path, "vid-bigplay") ||
        this._pathHasClass(path, "vid-progress");
      if (onControl) {
        this._showPills();
        return;
      }
      if (this._previewVideoEl && this._pillsVisible) {
        this._hidePillsNow();
      } else {
        this._showPills();
      }
      return;
    }

    this._swiping = false;

    if (this.config?.clean_mode && !this._previewOpen) return;

    const endX = (e.clientX !== 0 || e.clientY !== 0) ? e.clientX : this._swipeCurX;
    const endY = (e.clientX !== 0 || e.clientY !== 0) ? e.clientY : this._swipeCurY;
    const dx = endX - this._swipeStartX;
    const dy = endY - this._swipeStartY;

    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const path = e.composedPath?.() || [];
      const onControl =
        this._pathHasClass(path, "gallery-pill") ||
        this._pathHasClass(path, "pnavbtn") ||
        this._pathHasClass(path, "pnav") ||
        this._pathHasClass(path, "vid-bigplay") ||
        this._pathHasClass(path, "vid-progress");
      if (onControl) {
        this._showPills();
        return;
      }
      if (this._previewVideoEl && this._pillsVisible) {
        this._hidePillsNow();
      } else {
        this._showPills();
      }
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
    this._showPills();
  }

  /** iOS-Photos-style sticky time pill — surfaces the date/time of the
   * center-most visible thumbnail while the user is scrolling, fades out
   * ~800 ms after the last scroll event. */
  _onThumbsScroll(e) {
    const el = e.currentTarget;
    if (!el) return;

    const thumbs = el.querySelectorAll(".tthumb");
    if (!thumbs.length) return;

    const isVertical = this._isThumbLayoutVertical();
    const rect = el.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top + rect.height / 2;

    let bestThumb = null;
    let bestDist = Infinity;
    for (const t of thumbs) {
      const tRect = t.getBoundingClientRect();
      const cx = tRect.left + tRect.width / 2;
      const cy = tRect.top + tRect.height / 2;
      const d = isVertical ? Math.abs(cy - targetY) : Math.abs(cx - targetX);
      if (d < bestDist) {
        bestDist = d;
        bestThumb = t;
      }
    }
    if (!bestThumb) return;

    const src = bestThumb.dataset.lazySrc || bestThumb.dataset.src || "";
    const dtMs = this._pipeline?.resolveItemMs?.(src);
    if (typeof dtMs !== "number" || !Number.isFinite(dtMs)) return;

    this._scrollPillText = this._formatScrollPillTime(dtMs);
    this._scrollPillVisible = true;
    if (this._scrollPillTimer) clearTimeout(this._scrollPillTimer);
    this._scrollPillTimer = setTimeout(() => {
      this._scrollPillVisible = false;
      this._scrollPillTimer = null;
    }, 800);
  }

  _formatScrollPillTime(ms) {
    try {
      const lang = this._hass?.locale?.language || "nl-NL";
      return new Date(ms).toLocaleTimeString(lang, {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return new Date(ms).toLocaleTimeString();
    }
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

    // A reconfigure (not the card's initial setConfig, which happens before
    // first hass ever sets this) invalidates a still-pending deep-link
    // newest-clip selection — the item list that flag was waiting on may no
    // longer be the same list.
    if (prevConfig) this._pendingUrlGallerySelectNewest = false;

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
      JSON.stringify(prevConfig.live_cameras) !==
        JSON.stringify(nextConfig.live_cameras);
    if (liveEntityChanged) {
      const liveOptions = this._getLiveCameraOptions();
      const validSelected =
        this._liveSelectedCamera &&
        liveOptions.some((x) => x === this._liveSelectedCamera);
      if (!validSelected && liveOptions.length > 0) {
        this._liveSelectedCamera = liveOptions[0] || "";
      }
      if (prevConfig) {
        this._aspectRatio = this._parseAspectRatio(nextConfig.aspect_ratio);
      }
    }

    if (!prevConfig) {
      this._previewOpen = this.config.clean_mode ? false : true;
      this._showLivePicker = false;
      this._aspectRatio = this._parseAspectRatio(nextConfig.aspect_ratio);
      const hasMedia = nextConfig.entities.length > 0 || nextConfig.media_sources.length > 0;
      const startMode = nextConfig.start_mode;
      const hasLiveCam = Array.isArray(nextConfig.live_cameras) && nextConfig.live_cameras.length > 0;
      if (startMode === "live" && nextConfig.live_enabled && hasLiveCam) {
        this._viewMode = "live";
      } else if (startMode === "hybrid" && nextConfig.live_enabled && hasLiveCam) {
        this._viewMode = "hybrid";
      } else if (startMode === "gallery") {
        this._viewMode = "media";
      } else {
        this._viewMode =
          nextConfig.live_enabled && hasLiveCam && !hasMedia
            ? "live"
            : "media";
      }
    } else if (
      prevConfig.clean_mode !== this.config.clean_mode
    ) {
      this._previewOpen = !this.config.clean_mode;
    }

    // Flipping "Default view" in the editor follows live, so the preview
    // switches immediately instead of only on reload.
    if (prevConfig && prevConfig.start_mode !== this.config.start_mode) {
      const sm = this.config.start_mode;
      const hasLiveCam =
        Array.isArray(this.config.live_cameras) && this.config.live_cameras.length > 0;
      if ((sm === "live" || sm === "hybrid") && this.config.live_enabled && hasLiveCam) {
        this._viewMode = sm === "hybrid" ? "hybrid" : "live";
      } else if (sm === "gallery") {
        this._viewMode = "media";
      }
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
      ["live_cameras", "live_enabled"].includes(k)
    );

    if (liveCameraConfigChanged) {
      this._teardownLiveView();
      this._signedWsPath = null;
    }

    if (!this._hasLiveConfig()) {
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

    // Start/stop the talkback-bar waveform loop based on mic state.
    if (changedProps.has("_micState")) {
      if (this._micState === "active") this._startMicWaveLoop();
      else this._stopMicWaveLoop();
    }

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
      // Frigate triggers may need the event subscription even without a
      // Frigate media source. Idempotent when already subscribed.
      this._subscribeFrigateEvents();
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
      const filteredBeforeCluster = filteredAll.slice(0, Math.min(cap, filteredAll.length));
      // Match the render's view so the resolve queue includes expanded
      // cluster members — otherwise tapping a member sits on a skeleton.
      const filtered = this._injectExpandedClusterMembers(filteredBeforeCluster);
      const thumbRenderLimit = this._getThumbRenderLimit(cap, usingMediaSource);

      // Consume the `cgc_view=gallery` deep-link's one-shot flag the first
      // time the item list is actually populated — before this, there is
      // nothing to select. Sort order flips which end is "newest": index 0
      // for `newest` (the default), the last index once `.reverse()'d for
      // `oldest` (see sortItemsByTime in data/item-pipeline.ts). Consumed
      // exactly once regardless of outcome so a later render can't yank the
      // user off a clip they navigated to themselves.
      if (this._pendingUrlGallerySelectNewest) {
        this._pendingUrlGallerySelectNewest = false;
        if (filtered.length) {
          const sortOrder = String(this.config?.thumb_sort_order || "newest").toLowerCase().trim();
          this._selectedIndex = sortOrder === "oldest" ? filtered.length - 1 : 0;
          // Also scroll the thumbnail strip to it — under `oldest` sorting
          // the newest clip lands at the end of the strip, off-screen by
          // default (see the other `_selectedIndex`/`_pendingScrollToI`
          // pairs in this file, e.g. `_navNext`/`_navPrev`).
          this._pendingScrollToI = this._selectedIndex;
        }
      }

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
    this._syncGridResizeObserver();
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
              if (isSensor && key && this._isVideoForSrc(key)) {
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

    // No items yet: render skeletons while the first media listing is in
    // flight (#184), fall back to live-only when a live camera is configured
    // (issue #169), else show the empty message. In the first two cases we
    // fall through to the normal render — the downstream paths all guard on
    // `filtered.length` and the live pipeline is independent of `rawItems`.
    // `liveOnlyView` is used again below to suppress the now-empty toolbar /
    // thumbs strip / filter chips; `galleryLoading` keeps them as skeletons.
    const {
      loading: galleryLoading,
      liveOnly: liveOnlyView,
      emptyMessage,
    } = galleryState({
      itemCount: rawItems.length,
      usingMediaSource,
      mediaLoading: !!this._mediaClient.isLoading(),
      hasLive: this._hasLiveConfig(),
    });

    if (emptyMessage) {
      return html`<div class="empty">${emptyMessage}</div>`;
    }

    const { days, newestDay, activeDay, objFiltered, videoCount, imageCount } = base;

    const showTypeFilter = videoCount > 0 && imageCount > 0;
    if (!showTypeFilter) { this._filterVideo = false; this._filterImage = false; }

    const filteredAll = objFiltered.filter((x) =>
      this._matchesTypeFilter(x.src) &&
      (!this._filterFavorites || this._favorites.has(x.src))
    );

    // While the first listing loads there are no items, but that isn't a
    // "no results" state: keep the preview / thumbs skeletons instead.
    const noResultsForFilter = !filteredAll.length && !galleryLoading;

    const cap = (this.config?.max_media ?? DEFAULT_MAX_MEDIA);
    const filteredBeforeCluster = noResultsForFilter
      ? []
      : filteredAll.slice(0, Math.min(cap, filteredAll.length));
    const filtered = this._injectExpandedClusterMembers(filteredBeforeCluster);

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

    const currentForNav = activeDay ?? newestDay;
    const dayIdx = currentForNav ? days.indexOf(currentForNav) : -1;
    const canPrev = dayIdx >= 0 && dayIdx < days.length - 1;
    const canNext = dayIdx > 0;
    // Highlight "Today" only when the active day is the literal current date,
    // not merely the newest day with media (issue #191: with empty current-day
    // folders pruned, the newest day is often an earlier date).
    const isToday = currentForNav === dayKeyFromMs(Date.now());

    const sp = parseServiceParts(this.config?.delete_service);
    const fsp = parseServiceParts(this.config?.frigate_delete_service);

    const canDelete = !!sp || !!fsp;
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
    const isHybrid = this._isHybridActive();
    // Live view is always "open" regardless of _previewOpen
    const previewOpenFinal = previewOpen || isLive;
    const showPreviewSection = previewOpenFinal;
    const useDatePicker = showTypeFilter && navigator.maxTouchPoints > 0;
    const isVerticalThumbs = this._isThumbLayoutVertical();

    // Gallery chrome (top toolbar, filter chips, thumbs strip) renders when
    // it's actually useful:
    //   - clean_mode + preview/live open → user wants minimal UI
    //   - live-only view (issue #169)    → no items at all, nothing to do
    //   - hybrid mode                    → drawer is the only gallery surface
    // The live overlay pills sit inside `#live-card-host` and stay either way.
    const showGalleryControls = !liveOnlyView && !isHybrid && (!this.config?.clean_mode || (!this._previewOpen && !isLive));

    const rootVars = this._renderRootVars();

    const fixedMode = this.config.controls_mode === "fixed";

    // Resolve which pills go in the overlay for this render — single
    // ordered list, sorted by the user's effective `order` (catalog
    // defaults applied where the user hasn't overridden). See
    // `src/data/pill-catalog.ts`.
    const galleryPillCtx = {
      selected,
      idx,
      filtered,
      previewGated,
      selectedIsVideo,
      selectedHasUrl,
      noResultsForFilter,
    };
    const galleryPillSettings = resolvePillSettings(
      GALLERY_PILL_CATALOG,
      this.config?.gallery_pills,
    );
    const galleryPillIds = sortPillsByOrder(GALLERY_PILL_CATALOG, galleryPillSettings);
    // Back/close-preview is rendered unconditionally — without it the
    // user can get stranded in preview mode. Not in the catalog so the
    // editor can't disable it, and it always sits leftmost in the row.
    //
    // No wrapper div here: in overlay mode the outer `.gallery-pills`
    // div in the render below owns positioning + visibility, and in
    // fixed mode the pills go straight into `.controls-bar-fixed`. A
    // wrapper here would nest two `.gallery-pills` elements and the
    // inner would inherit opacity:0 (no `.visible` class), hiding the
    // pills completely.
    const galleryPillsRow = this._renderGalleryPillsRow({ previewGated, galleryPillIds, galleryPillCtx });
    const livePillsLeft = this._renderLivePillsLeft({ previewGated });
    // Rows 1 and 2 and the hamburger menu (#286): built-in pills and
    // `placement: controls` menu buttons sorted together per row.
    const allMenuButtons = Array.isArray(this.config.menu_buttons) ? this.config.menu_buttons : [];
    const controlZones = liveControlZones(this.config?.live_pills, allMenuButtons);
    const panelMenuButtons = controlZones.menu.map((i) => allMenuButtons[i.index]).filter(Boolean);
    const renderControl = (item) =>
      item.kind === "pill"
        ? item.enabled ? this._renderLivePillById(item.id) : null
        : this._renderControlMenuButton(allMenuButtons[item.index]);
    const liveRow2Controls = controlZones.row2.map(renderControl).filter((tpl) => tpl != null);
    const livePillsRight = this._renderLivePillsRight({ controlZones, renderControl, panelMenuButtons });
    const selectBtn = this._menuSelectEntity
      ? (this.config.menu_buttons ?? []).find((b) => b.entity === this._menuSelectEntity)
      : null;
    const selectTap = selectBtn ? menuButtonTap(selectBtn, this._hass?.states?.[selectBtn.entity]) : null;
    const hamburgerPanel = this._renderHamburgerPanel({ selectTap, panelMenuButtons, selectBtn });

    const previewBlock = this._renderPreviewBlock({
      showPreviewSection,
      isLive,
      noResultsForFilter,
      selectedHasUrl,
      selectedIsVideo,
      selectedUrl,
      filtered,
      idx,
      fixedMode,
      tsPosClass,
      galleryPillsRow,
      livePillsLeft,
      livePillsRight,
      liveRow2Controls,
      hamburgerPanel,
      galleryPillSettings,
      days,
      currentForNav,
    });

    const showLiveRow2Fixed = isLive && !isGridLayout(this.config, this._liveLayoutOverride) && liveRow2Controls.length;
    const controlsFixedBlock = this._renderControlsFixedBlock({
      fixedMode,
      showPreviewSection,
      isLive,
      livePillsLeft,
      livePillsRight,
      tsPosClass,
      galleryPillsRow,
      showLiveRow2Fixed,
      liveRow2Controls,
    });

    // Talkback in its own row below/above the preview (#257). Only when there
    // is a talk source for the active camera, so no empty row takes a gap.
    const micPos = talkbackPosition(this.config?.live_mic_position);
    const talkCam = isLive && !isGridLayout(this.config, this._liveLayoutOverride) ? this._getEffectiveLiveCamera() : "";
    const talkbackRow = showPreviewSection && isTalkbackRow(micPos) && talkCam && this._talkSourceFor(talkCam)
      ? html`<div class="talkback-row" style="display:flex;justify-content:${talkbackRowJustify(this.config?.live_mic_shape === "button" ? "button" : "bar", this.config?.live_mic_button_position)};">${this._renderMicTalkbackBar(true)}</div>`
      : html``;
    const talkbackAbove = micPos === "above" ? talkbackRow : html``;
    const talkbackBelow = micPos === "below" ? talkbackRow : html``;

    const objectFiltersBlock = this._renderObjectFiltersBlock({ visibleObjectFilters });

    const thumbsBlock = this._renderThumbsBlock({
      noResultsForFilter,
      canDelete,
      isVerticalThumbs,
      thumbs,
      galleryLoading,
      idx,
      isLive,
      usingMediaSource,
      thumbRatio,
    });

    const toolbarBlock = this._renderToolbar({
      showGalleryControls,
      useDatePicker,
      currentForNav,
      canPrev,
      canNext,
      days,
      isToday,
      showTypeFilter,
      isLive,
      showLiveToggle,
      newestDay,
    });
    const imgFsBlock = this._renderImageFullscreen({ selectedUrl, selectedIsVideo, filtered, idx });
    return html`
      <div class="root" style="${rootVars}">
        <div class="panel" style="width:${PREVIEW_WIDTH}; margin:0 auto;">
          ${!previewAtBottom && showPreviewSection
            ? html`${talkbackAbove}${previewBlock}${controlsFixedBlock}${talkbackBelow}${showGalleryControls && !fixedMode ? html`<div class="divider"></div>` : html``}`
            : html``}

          ${toolbarBlock}
          ${showGalleryControls ? html`
            ${visibleObjectFilters.length
              ? html`
                  <div class="divider"></div>
                  ${objectFiltersBlock}
                `
              : html``}

            ${thumbsBlock}
          ` : html``}

          ${previewAtBottom && showPreviewSection
            ? html`${showGalleryControls && !fixedMode ? html`<div class="divider"></div>` : html``}${talkbackAbove}${previewBlock}${controlsFixedBlock}${talkbackBelow}`
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

        ${imgFsBlock}

      </div>
    `;
  }

  /** CSS variables on the card root. Part of render(). */
  _renderRootVars() {
    return `
      --cgc-card-radius:10px;
      --cgc-bar-opacity:${this.config.bar_opacity};
      --cgc-talkback-opacity:${this.config.talkback_opacity ?? this.config.bar_opacity};
      --cgc-chevron-opacity:${this.config.chevron_opacity ?? this.config.bar_opacity};
      --cgc-thumb-row-h:${this.config.thumb_size}px;
      --cgc-thumb-empty-h:${this.config.thumb_size}px;
      --cgc-thumb-off-opacity:${this.config.thumb_off_opacity};
      --cgc-topbar-margin:${STYLE.topbar_margin};
      --cgc-topbar-padding:${STYLE.topbar_padding};
      --cgc-thumbs-max-h:${(this.config.card_height ?? 0) > 0 ? this.config.card_height + "px" : "320px"};
      --cgc-object-fit:${this.config.object_fit || "cover"};
      --cgc-pill-size:${this.config.pill_size}px;
      --cgc-row-gap:${this.config.row_gap}px;
      ${this.config.style_variables || ""}
    `;
  }

  /** The gallery overlay pills (back/close first). Part of render(). */
  _renderGalleryPillsRow({ previewGated, galleryPillIds, galleryPillCtx }) {
    return html`
      ${previewGated
        ? html`
            <button
              class="gallery-pill live-pill-btn"
              @pointerdown=${(e) => e.stopPropagation()}
              @click=${(e) => {
                e.stopPropagation();
                this._setViewMode("media");
                this._previewOpen = false;
                this.requestUpdate();
              }}
            >
              <ha-icon icon="mdi:arrow-left"></ha-icon>
            </button>
          `
        : html``}
      ${galleryPillIds
        .map((id) => this._renderGalleryPillById(id, galleryPillCtx))
        .filter((tpl) => tpl != null)}
    `;
  }

  /** Live controls on the left of row 1. Part of render(). */
  _renderLivePillsLeft({ previewGated }) {
    return html`
      <div class="live-pills-left">
        ${previewGated ? html`
          <button class="gallery-pill live-pill-btn" @pointerdown=${(e) => e.stopPropagation()} @click=${(e) => { e.stopPropagation(); this._setViewMode("media"); this._previewOpen = false; this.requestUpdate(); }}>
            <ha-icon icon="mdi:arrow-left"></ha-icon>
          </button>
        ` : html``}
        ${this.config.show_camera_title !== false && this.config.controls_mode !== "fixed" ? html`<div class="gallery-pill gallery-pill--wide gallery-pill--info"><span>${this._friendlyCameraName(this._getEffectiveLiveCamera())}</span></div>` : html``}
      </div>
    `;
  }

  /** Live controls on the right of row 1, plus the hamburger. Part of render(). */
  _renderLivePillsRight({ controlZones, renderControl, panelMenuButtons }) {
    return html`
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
        ${getPtzConfig(this.config, this._getEffectiveLiveCamera()) ? html`
          <button
            class="gallery-pill live-pill-btn ${this._ptzActive ? "active" : ""}"
            title=${this._ptzActive ? "Exit PTZ" : "PTZ controls"}
            aria-pressed=${this._ptzActive ? "true" : "false"}
            @pointerdown=${(e) => e.stopPropagation()}
            @click=${(e) => { e.stopPropagation(); this._togglePtz(); }}
          >
            <ha-icon icon="mdi:arrow-all"></ha-icon>
          </button>
        ` : html``}
        ${controlZones.row1.map(renderControl).filter((tpl) => tpl != null)}
        ${panelMenuButtons.length ? html`
          <div class="live-hamburger-wrap" @pointerdown=${(e) => e.stopPropagation()}>
            <button class="gallery-pill live-pill-btn ${this._hamburgerOpen && !this._menuSelectEntity ? 'active' : ''}" @click=${(e) => { e.stopPropagation(); const open = !(this._hamburgerOpen && !this._menuSelectEntity); this._menuSelectEntity = null; this._hamburgerOpen = open; if (!open) this._showPills(2500); }}>
              <ha-icon icon="mdi:menu"></ha-icon>
            </button>
          </div>
        ` : html``}
      </div>
    `;
  }

  /** The hamburger menu panel. Part of render(). */
  _renderHamburgerPanel({ selectTap, panelMenuButtons, selectBtn }) {
    return this._hamburgerOpen && (selectTap?.kind === "select" || panelMenuButtons.length) ? html`
      <div class="live-menu-backdrop" @pointerdown=${(e) => e.stopPropagation()} @click=${() => this._closeLiveMenu()}></div>
      <div class="live-menu-panel" @pointerdown=${(e) => e.stopPropagation()}>
        ${selectTap?.kind === "select"
          ? selectTap.options.map((option) => {
              // Option list for an input_select / select button (#215).
              const isCurrent = option === selectTap.current;
              return html`
                <button class="live-menu-panel-btn ${isCurrent ? "active" : ""}"
                  @click=${() => this._pickMenuSelectOption(selectBtn.entity, option)}
                  title="${option}">
                  <div class="panel-btn-icon">
                    <ha-icon icon="${isCurrent ? "mdi:check-circle" : "mdi:circle-outline"}"></ha-icon>
                  </div>
                  <span class="live-menu-panel-lbl">${option}</span>
                </button>
              `;
            })
          : panelMenuButtons.map((btn) => {
              const { isOn, icon, bg, label } = this._menuButtonView(btn);
              return html`
                <button class="live-menu-panel-btn ${isOn ? "active" : ""}"
                  @click=${() => this._onMenuButtonTap(btn)}
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
  }

  /** The preview pane. Part of render(). */
  _renderPreviewBlock({
    showPreviewSection,
    isLive,
    noResultsForFilter,
    selectedHasUrl,
    selectedIsVideo,
    selectedUrl,
    filtered,
    idx,
    fixedMode,
    tsPosClass,
    galleryPillsRow,
    livePillsLeft,
    livePillsRight,
    liveRow2Controls,
    hamburgerPanel,
    galleryPillSettings,
    days,
    currentForNav,
  }) {
    return showPreviewSection
      ? html`
          <div
            class="preview${isLive && this._getLiveRotationStyle() ? " cgc-rot-pane" : ""}${this._hybridDrawerOpen ? " hybrid-drawer-open" : ""}"
            style="aspect-ratio:${this._getPreviewAspectRatio(isLive)}; touch-action:${isLive ? "auto" : "pan-y"};"
            @pointerdown=${(e) => {
              if (e?.isPrimary === false) return;
              const path = e.composedPath?.() || [];
              
              // The `_isInsideTsbar(e)` check now also covers the new back button.
              const isOnControls =
                this._isLiveActive() ||
                this._isInsideTsbar(e) ||
                this._pathHasClass(path, "pnavbtn") ||
                path.some((el) => el?.tagName === "VIDEO") ||
                this._pathHasClass(path, "live-picker") ||
                this._pathHasClass(path, "live-picker-backdrop");

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
            @pointerleave=${(e) => {
              if (e.pointerType === "mouse") {
                this._hidePillsHover();
                // Hybrid: closing on mouse-leave keeps the hover-driven flow
                // symmetric — enter the edge to open, leave the card to close.
                if (this._hybridDrawerOpen) this._closeHybridDrawer();
              }
            }}
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
            ${this._hasLiveConfig() ? (() => {
              const liveRotStyle = this._getLiveRotationStyle();
              const liveCropStyle = this._getLiveCropStyle();
              return html`<div id="live-card-host" class="live-card-host${isLive ? '' : ' live-host-hidden'}${liveCropStyle ? ' has-crop' : ''}${liveRotStyle ? ' has-rot' : ''}" style="${liveCropStyle}${liveRotStyle}"></div>${this._renderSnapshotToast()}${this._renderStreamLostBanner()}`;
            })() : html``}
            ${this._isHybridActive() ? this._renderHybridDrawer(filtered, days, currentForNav) : html``}

            ${!noResultsForFilter && !isLive && this.config?.gallery_chevrons_enabled !== false && filtered.length > 1 && (this._pillsVisible || this.config?.persistent_controls) ? html`
              <div class="pnav">
                <button class="pnavbtn left" ?disabled=${idx <= 0} @click=${(e) => { e.stopPropagation(); this._navPrev(); }}>
                  <ha-icon icon="mdi:chevron-left"></ha-icon>
                </button>
                <button class="pnavbtn right" ?disabled=${idx >= filtered.length - 1} @click=${(e) => { e.stopPropagation(); this._navNext(filtered.length); }}>
                  <ha-icon icon="mdi:chevron-right"></ha-icon>
                </button>
              </div>
            ` : html``}

            ${isLive && this.config?.live_chevrons_enabled !== false && !isGridLayout(this.config, this._liveLayoutOverride) && this._getLiveCameraOptions().length > 1 && (this._pillsVisible || this.config?.persistent_controls) ? html`
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
              <div class="gallery-pills align-${this.config?.gallery_pills_align || "center"} ${tsPosClass} ${this._pillsVisible || this.config?.persistent_controls ? "visible" : ""}">
                ${galleryPillsRow}
              </div>
            ` : html``}
            ${!isLive && selectedIsVideo && selectedHasUrl && !noResultsForFilter ? (() => {
              const dur = this._galleryDuration || 0;
              const pct = dur > 0 ? Math.max(0, Math.min(100, (this._galleryCurrentTime / dur) * 100)) : 0;
              const visible = this._pillsVisible || this.config?.persistent_controls;
              const cur = formatVideoTime(this._galleryCurrentTime || 0);
              const durStr = dur > 0 ? formatVideoTime(dur) : "—:—";
              // Time read-out is in the pill catalog purely so it can be
              // toggled on/off — it renders here (bottom-right) regardless
              // of catalog order. Reordering it in the editor has no visual
              // effect by design.
              const timeEnabled = galleryPillSettings.get("video_time")?.enabled !== false;
              return html`
                <button
                  class="vid-bigplay ${visible ? "visible" : ""}"
                  title=${this._galleryPlaying ? "Pause" : "Play"}
                  aria-pressed=${this._galleryPlaying ? "true" : "false"}
                  @pointerdown=${(e) => e.stopPropagation()}
                  @pointerup=${(e) => e.stopPropagation()}
                  @click=${(e) => { e.stopPropagation(); this._toggleGalleryPlayPause(); this._showPills(); }}
                >
                  <ha-icon icon=${this._galleryPlaying ? "mdi:pause" : "mdi:play"}></ha-icon>
                </button>
                ${timeEnabled ? html`
                  <div class="vid-time ${visible ? "visible" : ""}">
                    <span>${cur} / ${durStr}</span>
                  </div>
                ` : html``}
                <div class="vid-progress ${visible ? "visible" : ""}" @pointerdown=${(e) => this._onVidProgressDown(e)} @pointerup=${(e) => e.stopPropagation()}>
                  <div class="vid-progress-fill" style="width:${pct}%"></div>
                </div>
              `;
            })() : html``}
            ${isLive && !isGridLayout(this.config, this._liveLayoutOverride) && !fixedMode ? html`
              <div class="live-controls-bar ${tsPosClass} ${this._pillsVisible || this._showLivePicker || this.config?.persistent_controls ? "visible" : ""}">
                <div class="live-controls-main">
                  ${livePillsLeft}${livePillsRight}
                </div>
                ${liveRow2Controls.length ? html`
                  <div class="live-controls-main live-controls-row2">
                    <div class="live-pills-right">${liveRow2Controls}</div>
                  </div>
                ` : html``}
                ${this._renderMicErrorToast()}
              </div>
            ` : html``}
            ${isLive && !isGridLayout(this.config, this._liveLayoutOverride) ? hamburgerPanel : html``}
            ${isLive && !isGridLayout(this.config, this._liveLayoutOverride) && !isTalkbackRow(talkbackPosition(this.config?.live_mic_position)) ? this._renderMicTalkbackBar() : html``}
            ${isLive && !isGridLayout(this.config, this._liveLayoutOverride) ? this._renderPtzOverlay() : html``}
          </div>
        `
      : html``;
  }

  /** The controls bar when controls_mode is fixed. Part of render(). */
  _renderControlsFixedBlock({
    fixedMode,
    showPreviewSection,
    isLive,
    livePillsLeft,
    livePillsRight,
    tsPosClass,
    galleryPillsRow,
    showLiveRow2Fixed,
    liveRow2Controls,
  }) {
    return fixedMode && showPreviewSection ? html`
      <div class="controls-bar-fixed">
        ${isLive && !isGridLayout(this.config, this._liveLayoutOverride) ? html`
          <div class="live-controls-main live-controls-main--fixed">
            ${livePillsLeft}${livePillsRight}
          </div>
        ` : tsPosClass !== "hidden" && !isLive ? html`
          ${galleryPillsRow}
        ` : html``}
      </div>
      ${showLiveRow2Fixed ? html`
        <div class="controls-bar-fixed controls-bar-fixed--row2">
          <div class="live-controls-main live-controls-main--fixed">
            <div class="live-pills-right">${liveRow2Controls}</div>
          </div>
        </div>
      ` : html``}
    ` : html``;
  }

  /** The object filter chips. Part of render(). */
  _renderObjectFiltersBlock({ visibleObjectFilters }) {
    return visibleObjectFilters.length
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
  }

  /** The thumbnail strip. Part of render(). */
  _renderThumbsBlock({
    noResultsForFilter,
    canDelete,
    isVerticalThumbs,
    thumbs,
    galleryLoading,
    idx,
    isLive,
    usingMediaSource,
    thumbRatio,
  }) {
    return html`
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
          <div class="scroll-time-pill ${this._scrollPillVisible ? "visible" : ""}" aria-hidden="true">${this._scrollPillText}</div>
          ${thumbs.length
            ? html`
                <div
                  class="tthumbs ${isVerticalThumbs ? "vertical" : "horizontal"}"
                  style="--cgc-thumb-gap:${THUMB_GAP}px;"
                  @wheel=${isVerticalThumbs ? null : this._onThumbWheel}
                  @scroll=${(e) => this._onThumbsScroll(e)}
                >
                  ${thumbs.map((it) => {
                    const isOn = it.i === idx && !isLive;
                    const isSel = this._selectedSet?.has(it.src);
                    const isMs = usingMediaSource && isMediaSourceId(it.src);
                    const clusterMeta = isMs ? this._mediaClient?.getClusterMeta?.(it.src) : null;
                    const isExpanded = clusterMeta && this._expandedClusters.has(it.src);

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
                        class="tthumb ${isOn ? "on" : ""} ${this._selectMode && isSel ? "sel" : ""} bar-${barPos} ${showBar ? "with-bar" : ""} ${it._clusterMember ? "cluster-member" : ""}"
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
                        @pointercancel=${(e) => this._onThumbPointerCancel(e)}
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

                          // Collapse any open clusters when the user taps
                          // outside the active set. Members and the rep
                          // of a currently-expanded cluster both count
                          // as "inside" — only fully unrelated thumbs
                          // close it.
                          const isOwnRep = this._expandedClusters.has(it.src);
                          if (!it._clusterMember && !isOwnRep && this._expandedClusters.size > 0) {
                            this._expandedClusters.clear();
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
                          : isVid && isReolinkRoot(it.src)
                            ? html`<div class="tph reolink" aria-hidden="true" title="Reolink clip">
                                <img class="tph-reolink-mark" src=${REOLINK_LOGO_DATA_URL} alt="" />
                              </div>`
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

                        ${this.config?.show_favorite === false ? html`` : html`
                        <div
                          class="fav-btn ${this._favorites.has(it.src) ? 'on' : ''}"
                          @click=${(e) => {
                            e.stopPropagation();
                            const wasOn = this._favorites.has(it.src);
                            this._favorites.toggle(it.src);
                            // Star-pop animation when *adding* a favourite — skip on removal so
                            // accidental clicks don't get a celebratory burst.
                            if (!wasOn && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
                              try {
                                e.currentTarget.animate(
                                  [
                                    { transform: "scale(1) rotate(0deg)",     filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" },
                                    { transform: "scale(2.2) rotate(-14deg)", filter: "drop-shadow(0 0 22px gold) drop-shadow(0 0 10px gold) drop-shadow(0 1px 2px rgba(0,0,0,0.6))", offset: 0.45 },
                                    { transform: "scale(1) rotate(0deg)",     filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" },
                                  ],
                                  { duration: 380, easing: "cubic-bezier(.34, 1.56, .64, 1)" }
                                );
                              } catch (_) { /* WAAPI not supported — silently skip */ }
                            }
                          }}
                          @pointerdown=${(e) => e.stopPropagation()}
                          role="button"
                          title="Favorite"
                        >
                          <ha-icon icon="${this._favorites.has(it.src) ? 'mdi:star' : 'mdi:star-outline'}"></ha-icon>
                        </div>
                        `}

                        ${clusterMeta && clusterMeta.count > 1
                          ? html`<button
                              type="button"
                              class="cluster-badge ${isExpanded ? "open" : ""}"
                              title="${clusterMeta.count} events — tap to ${isExpanded ? "collapse" : "expand"}"
                              @pointerdown=${(e) => e.stopPropagation()}
                              @click=${(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                this._toggleClusterExpand(it.src);
                              }}
                            >${clusterMeta.count}×</button>`
                          : html``}
                      </button>
                    `;
                  })}
                </div>
              `
            : galleryLoading
              ? html`
                  <div
                    class="tthumbs ${isVerticalThumbs ? "vertical" : "horizontal"} tthumbs-loading"
                    style="--cgc-thumb-gap:${THUMB_GAP}px;"
                    role="status"
                    aria-label="Loading media"
                  >
                    ${Array.from({ length: SKELETON_THUMB_COUNT }, () => html`
                      <div
                        class="tthumb tthumb-skeleton"
                        aria-hidden="true"
                        style="${isVerticalThumbs
                          ? `aspect-ratio:${thumbRatio};border-radius:var(--cgc-thumb-radius, ${THUMB_RADIUS}px);`
                          : `width:${this.config.thumb_size}px;aspect-ratio:${thumbRatio};border-radius:var(--cgc-thumb-radius, ${THUMB_RADIUS}px);`}"
                      >
                        <div class="tph skeleton"></div>
                      </div>
                    `)}
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
  }

  /** The top toolbar with the day navigation. Part of render(). */
  _renderToolbar({
    showGalleryControls,
    useDatePicker,
    currentForNav,
    canPrev,
    canNext,
    days,
    isToday,
    showTypeFilter,
    isLive,
    showLiveToggle,
    newestDay,
  }) {
    if (!showGalleryControls) return html``;
    // Order from `toolbar_order` config; default to catalog order.
    // Enabled state stays in the existing `show_*` keys.
    const orderMap = (this.config?.toolbar_order && typeof this.config.toolbar_order === "object")
      ? this.config.toolbar_order : {};
    const toolbarIds = [...TOOLBAR_CATALOG]
      .map((e) => ({ id: e.id, order: typeof orderMap[e.id] === "number" ? orderMap[e.id] : e.defaultOrder }))
      .sort((a, b) => a.order - b.order || TOOLBAR_CATALOG.findIndex(c => c.id === a.id) - TOOLBAR_CATALOG.findIndex(c => c.id === b.id))
      .map((x) => x.id);
    const datepillBlock = useDatePicker ? html`
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
    `;
    const renderToolbarBtn = (id) => {
      switch (id) {
        case "today":
          if (this.config?.show_today === false) return null;
          return html`
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
          `;
        case "media_filter":
          if (!(showTypeFilter && this.config?.show_media_filter !== false)) return null;
          return html`
            <div class="seg" style="${isLive ? "opacity:0.35;pointer-events:none" : ""}">
              <button class="segbtn ${this._filterVideo ? "on" : ""}" @click=${() => this._toggleFilterVideo()} title="Videos" style="border-radius:10px 0 0 10px">
                <ha-icon icon="mdi:video" style="--mdc-icon-size:16px"></ha-icon>
              </button>
              <button class="segbtn ${this._filterImage ? "on" : ""}" @click=${() => this._toggleFilterImage()} title="Photos" style="border-radius:0 10px 10px 0">
                <ha-icon icon="mdi:image" style="--mdc-icon-size:16px"></ha-icon>
              </button>
            </div>
          `;
        case "favorite":
          if (this.config?.show_favorite === false) return null;
          return html`
            <div class="seg">
              <button class="segbtn ${this._filterFavorites ? "on" : ""}" @click=${() => this._toggleFilterFavorites()} title="Favorites" style="border-radius:10px">
                <ha-icon icon="mdi:star" style="--mdc-icon-size:16px"></ha-icon>
              </button>
            </div>
          `;
        case "live":
          if (!(showLiveToggle && this.config?.show_live !== false)) return null;
          return html`
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
          `;
        default:
          return null;
      }
    };
    // Datepill anchored after the first enabled toolbar button if
    // any, otherwise renders first. Preserves the original layout
    // (Today + Datepill at the left) when defaults are in play.
    const rendered = toolbarIds.map((id) => ({ id, tpl: renderToolbarBtn(id) })).filter((x) => x.tpl != null);
    const firstIdx = rendered.length > 0 ? 0 : -1;
    return html`
      <div class="topbar">
        ${firstIdx >= 0 ? rendered[firstIdx].tpl : html``}
        ${datepillBlock}
        ${rendered.slice(firstIdx + 1).map((x) => x.tpl)}
      </div>
    `;
  }

  /** The fullscreen image or video overlay. Part of render(). */
  _renderImageFullscreen({ selectedUrl, selectedIsVideo, filtered, idx }) {
    return this._imgFsOpen && selectedUrl ? html`
      <div class="img-fs-overlay" @click=${() => {
        if (this._zoomScale > 1) {
          this._resetZoom();
        } else {
          this._closeImageFullscreen();
        }
      }}>
        ${selectedIsVideo
          ? html`<video src=${selectedUrl} controls playsinline
              ?autoplay=${this._imgFsHandoff ? this._imgFsHandoff.playing : true}
              ?muted=${this._galleryMuted}
              @loadedmetadata=${(e) => this._applyImgFsHandoff(e.currentTarget)}
              @click=${(e) => e.stopPropagation()}></video>`
          : html`<img src=${selectedUrl} alt=""
              @click=${(e) => e.stopPropagation()}
              @dblclick=${(e) => {
                if (this.config?.fullscreen_zoom !== false) {
                  e.stopPropagation();
                  this._toggleFullscreenZoom(e.clientX, e.clientY);
                }
              }}
            />`}
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
    ` : html``;
  }

  static get styles() {
    return cardStyles;
  }
}

CameraGalleryCard.prototype.getCardSize = function() { return 6; };
// Sections-view size (HA 2024.11+). HA prefers this over the deprecated
// getLayoutOptions, which stays only for older versions.
CameraGalleryCard.prototype.getGridOptions = function() {
  return { ...CARD_GRID_OPTIONS };
};
CameraGalleryCard.prototype.getLayoutOptions = function() {
  return { ...CARD_LAYOUT_OPTIONS };
};

customElements.define("camera-gallery-card", CameraGalleryCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "camera-gallery-card",
  name: "Camera Gallery Card",
  description:
    "Media gallery for Home Assistant (sensor fileList OR media_source folder) with optional live preview",
  preview: true,
  documentationURL: "https://github.com/TheScubaDiver/camera-gallery-card",
  // Card picker "By entity" tab (HA 2026.6+): offer this card for cameras.
  getEntitySuggestion: (hass, entityId) => cardEntitySuggestion(hass, entityId),
});

console.info(`Camera Gallery Card v${CARD_VERSION}`);
