/**
 * Pure helpers for user-defined `thumb_actions` (#243): extra entries in the
 * long-press thumbnail menu that call a Home Assistant action with details of
 * the pressed item.
 *
 * ```yaml
 * thumb_actions:
 *   - name: Archive
 *     icon: mdi:archive-arrow-down
 *     perform_action: script.archive_clip
 *     data:
 *       path: "{path}"
 *       media_id: "{media_id}"
 * ```
 *
 * Placeholders use the card's `{…}` style (as in `file_filter`), so they never
 * collide with Home Assistant `{{ }}` templates a script may use itself.
 */

import { toFsPath } from "./sensor-source";

/** One configured menu action, as validated by `structs.ts`. */
export interface ThumbActionConfig {
  name: string;
  icon?: string | undefined;
  perform_action: string;
  data?: Record<string, unknown> | undefined;
  target?: Record<string, unknown> | undefined;
  confirmation?: boolean | { text?: string | undefined } | undefined;
}

/** Values a placeholder can expand to, all strings (empty when unknown). */
export interface ThumbActionContext {
  /** The item's own id: a `media-source://` URI or the sensor file URL/path. */
  media_id: string;
  /** Browser-reachable URL of the file (resolved for media-source items). */
  url: string;
  /** Filesystem path on the HA host, when it can be derived; else `""`. */
  path: string;
  /** Last path segment of the item, decoded. */
  filename: string;
}

/** A ready-to-send `hass.callService` call. */
export interface ThumbActionCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
  target?: Record<string, unknown>;
}

/** Placeholder names, kept in sync with {@link ThumbActionContext}. */
export const THUMB_ACTION_PLACEHOLDERS = ["media_id", "url", "path", "filename"] as const;

const PLACEHOLDER_RE = new RegExp(`\\{(${THUMB_ACTION_PLACEHOLDERS.join("|")})\\}`, "g");

/** HA's default `local` media directory on every install type. */
const LOCAL_MEDIA_PREFIX = "media-source://media_source/local/";
const LOCAL_MEDIA_FS_ROOT = "/media/";

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Best-effort filesystem path for an item on the HA host.
 *
 * - `media-source://media_source/local/<p>` → `/media/<p>` (HA's default
 *   `local` media dir). Other `media_dirs` keys can't be mapped from the
 *   frontend, so they — and integration sources such as Frigate or Reolink —
 *   yield `""`; scripts can still use `{media_id}`.
 * - `/local/…` URLs and `/config/www/…` paths → `/config/www/…` (the same
 *   mapping `delete_service` uses).
 */
export function thumbItemPath(src: unknown): string {
  const s = String(src ?? "").trim();
  if (!s) return "";
  if (s.startsWith(LOCAL_MEDIA_PREFIX)) {
    const rel = safeDecode(s.slice(LOCAL_MEDIA_PREFIX.length).split("?")[0] ?? "");
    return rel ? LOCAL_MEDIA_FS_ROOT + rel.replace(/^\/+/, "") : "";
  }
  if (s.startsWith("media-source://")) return "";
  return toFsPath(s);
}

/** Decoded last path segment of a URI / URL / path, without query or hash. */
export function thumbItemFilename(src: unknown): string {
  const s = String(src ?? "").trim();
  if (!s) return "";
  const noQuery = (s.split("?")[0] ?? "").split("#")[0] ?? "";
  const last = noQuery.replace(/\/+$/, "").split("/").pop() ?? "";
  return safeDecode(last);
}

/** Build the placeholder context for an item. */
export function thumbActionContext(src: unknown, resolvedUrl?: unknown): ThumbActionContext {
  const mediaId = String(src ?? "").trim();
  return {
    media_id: mediaId,
    url: String(resolvedUrl ?? "").trim() || mediaId,
    path: thumbItemPath(mediaId),
    filename: thumbItemFilename(mediaId),
  };
}

/**
 * Replace every known `{placeholder}` in strings, recursing into arrays and
 * plain objects. Other values, and unknown `{names}`, are left as-is.
 */
export function fillThumbActionPlaceholders(value: unknown, ctx: ThumbActionContext): unknown {
  if (typeof value === "string") {
    return value.replace(PLACEHOLDER_RE, (_m, key: keyof ThumbActionContext) => ctx[key]);
  }
  if (Array.isArray(value)) return value.map((v) => fillThumbActionPlaceholders(v, ctx));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = fillThumbActionPlaceholders(v, ctx);
    return out;
  }
  return value;
}

/**
 * Turn a configured action plus an item context into a service call, or
 * `null` when `perform_action` isn't `domain.service`.
 */
export function buildThumbActionCall(
  action: ThumbActionConfig,
  ctx: ThumbActionContext
): ThumbActionCall | null {
  const match = /^\s*([a-z0-9_]+)\.([a-z0-9_]+)\s*$/i.exec(String(action?.perform_action ?? ""));
  if (!match) return null;
  const call: ThumbActionCall = {
    domain: match[1] as string,
    service: match[2] as string,
    data: (fillThumbActionPlaceholders(action.data ?? {}, ctx) ?? {}) as Record<string, unknown>,
  };
  if (action.target && Object.keys(action.target).length) {
    call.target = fillThumbActionPlaceholders(action.target, ctx) as Record<string, unknown>;
  }
  return call;
}

/** Confirmation prompt text, or `null` when the action runs without asking. */
export function thumbActionConfirmText(action: ThumbActionConfig): string | null {
  const c = action?.confirmation;
  if (!c) return null;
  if (typeof c === "object" && c.text) return c.text;
  return `${action.name}?`;
}
