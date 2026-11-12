/**
 * Camera triggers: switch the card to a camera's live view when something
 * happens there (motion, a person, the doorbell), and go back afterwards.
 *
 * Pure decision logic, no DOM. The card feeds in:
 *   - `fire(camera, now, ctx)` when a trigger entity turns active or a
 *     Frigate event starts,
 *   - `userInteracted(now)` on every tap / key press on the card,
 *   - `tick(now)` about once a second while a trigger is holding.
 * The controller answers with what to do; the card does the actual view
 * switching and remembers nothing itself.
 *
 * Rules:
 *   - A trigger switches to that camera's single live view.
 *   - The view it came from is remembered once, at the first trigger of a
 *     run. Later triggers (same or other camera, last one wins) keep that
 *     original view and restart the hold.
 *   - `holdMs` after the last trigger the card goes back, as set by
 *     `returnTo`, unless the user touched the card in the meantime: then
 *     it stays where the user left it.
 *   - Triggers are ignored while the card is busy with something the user
 *     started (fullscreen, Picture-in-Picture, talkback) and for a short
 *     while after the user last touched the card.
 *   - Per camera, a trigger within `cooldownMs` of the previous accepted
 *     trigger for that camera is ignored (noisy motion sensors).
 */

export type ReturnTo = "previous" | "gallery" | "stay";

export const DEFAULT_HOLD_SECONDS = 30;
export const DEFAULT_COOLDOWN_SECONDS = 10;
export const DEFAULT_RETURN_TO: ReturnTo = "previous";
/** After the user last touched the card, triggers wait this long. */
export const INTERACTION_GRACE_MS = 15_000;

export interface LiveTriggerOptions {
  holdMs?: number;
  cooldownMs?: number;
  returnTo?: ReturnTo;
  interactionGraceMs?: number;
}

export interface FireContext<V> {
  /** Fullscreen, Picture-in-Picture, talkback or another "do not disturb" state. */
  blocked: boolean;
  /** Snapshot of the current view, kept to return to later. */
  currentView: V;
  /** The camera the card is showing in single live view right now, if any. */
  showingCamera: string | null;
}

export type FireResult =
  | { action: "switch"; camera: string }
  | { action: "extend"; camera: string }
  | { action: "ignore"; reason: "blocked" | "cooldown" | "interaction" };

export type TickResult<V> =
  | { action: "none" }
  | { action: "return"; to: "previous"; view: V }
  | { action: "return"; to: "gallery" }
  | { action: "release" };

export class LiveTriggerController<V = unknown> {
  private readonly holdMs: number;
  private readonly cooldownMs: number;
  private readonly returnTo: ReturnTo;
  private readonly graceMs: number;

  private activeCamera: string | null = null;
  private previousView: V | null = null;
  private hasPrevious = false;
  private lastTriggerAt = 0;
  private lastInteractionAt = Number.NEGATIVE_INFINITY;
  private interactedDuringHold = false;
  private readonly lastAcceptedAt = new Map<string, number>();

  constructor(opts: LiveTriggerOptions = {}) {
    this.holdMs = opts.holdMs ?? DEFAULT_HOLD_SECONDS * 1000;
    this.cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_SECONDS * 1000;
    this.returnTo = opts.returnTo ?? DEFAULT_RETURN_TO;
    this.graceMs = opts.interactionGraceMs ?? INTERACTION_GRACE_MS;
  }

  /** True while a trigger is holding the view (a return may still follow). */
  get holding(): boolean {
    return this.activeCamera !== null;
  }

  /** The camera the last accepted trigger switched to, while holding. */
  get camera(): string | null {
    return this.activeCamera;
  }

  fire(camera: string, now: number, ctx: FireContext<V>): FireResult {
    if (ctx.blocked) return { action: "ignore", reason: "blocked" };
    // A recent touch means the user is busy with the card: leave them alone.
    if (now - this.lastInteractionAt < this.graceMs) {
      return { action: "ignore", reason: "interaction" };
    }
    const last = this.lastAcceptedAt.get(camera);
    if (last !== undefined && now - last < this.cooldownMs) {
      return { action: "ignore", reason: "cooldown" };
    }
    this.lastAcceptedAt.set(camera, now);

    if (!this.holding) {
      // First trigger of a run: remember where we came from.
      this.previousView = ctx.currentView;
      this.hasPrevious = true;
      this.interactedDuringHold = false;
    }
    this.lastTriggerAt = now;
    const alreadyThere = this.activeCamera === camera && ctx.showingCamera === camera;
    this.activeCamera = camera;
    return alreadyThere ? { action: "extend", camera } : { action: "switch", camera };
  }

  userInteracted(now: number): void {
    this.lastInteractionAt = now;
    if (this.holding) this.interactedDuringHold = true;
  }

  tick(now: number): TickResult<V> {
    if (!this.holding) return { action: "none" };
    if (now - this.lastTriggerAt < this.holdMs) return { action: "none" };

    const view = this.previousView;
    const hadPrevious = this.hasPrevious;
    const interacted = this.interactedDuringHold;
    this.clearRun();

    if (interacted || this.returnTo === "stay") return { action: "release" };
    if (this.returnTo === "gallery") return { action: "return", to: "gallery" };
    if (!hadPrevious) return { action: "release" };
    return { action: "return", to: "previous", view: view as V };
  }

  /** Forget the current run, e.g. when the card is removed from the page. */
  reset(): void {
    this.clearRun();
    this.lastAcceptedAt.clear();
  }

  private clearRun(): void {
    this.activeCamera = null;
    this.previousView = null;
    this.hasPrevious = false;
    this.interactedDuringHold = false;
  }
}

/** States that count as "something happened" for a trigger entity. */
const ACTIVE_STATES = new Set(["on", "open", "detected", "occupied", "home", "ringing"]);
const DEAD_STATES = new Set(["unavailable", "unknown", "", "none"]);

/**
 * Did this state change activate a trigger? `event.*` entities (doorbell
 * presses and the like) fire on every new event, i.e. any change to a real
 * timestamp. Everything else fires when it turns active (`on`, `open`,
 * `detected`, ...), not when it stays active or turns off.
 */
export function isTriggerActivation(
  entityId: string,
  oldState: string | null | undefined,
  newState: string | null | undefined
): boolean {
  const next = String(newState ?? "").toLowerCase();
  const prev = String(oldState ?? "").toLowerCase();
  if (next === prev) return false;
  if (DEAD_STATES.has(next)) return false;
  if (entityId.startsWith("event.")) {
    // Coming back from unavailable, the state is the last event replayed,
    // not a new one.
    return !DEAD_STATES.has(prev);
  }
  return ACTIVE_STATES.has(next) && !ACTIVE_STATES.has(prev);
}

export interface TriggerCamera {
  /** Camera id as used in the live camera list (entity id or stream id). */
  id: string;
  /** Entity ids whose activation switches to this camera. */
  triggers: readonly string[];
}

/** entity id → camera ids it triggers (an entity may trigger several). */
export function buildTriggerMap(cameras: readonly TriggerCamera[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const cam of cameras) {
    for (const raw of cam.triggers) {
      const id = String(raw || "").trim();
      if (!id) continue;
      const list = map.get(id) ?? [];
      if (!list.includes(cam.id)) list.push(cam.id);
      map.set(id, list);
    }
  }
  return map;
}

/**
 * Which live camera a Frigate event belongs to. The Frigate integration
 * names camera entities `camera.<frigate camera name>`, so that is the
 * match. Returns null when no configured camera matches or when the label
 * is filtered out.
 */
export function frigateEventCamera(
  payload: unknown,
  cameraIds: readonly string[],
  labels: readonly string[] = []
): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p["type"] !== "new") return null;
  const ev = (p["after"] ?? p["before"]) as Record<string, unknown> | undefined;
  if (!ev || typeof ev !== "object") return null;
  const name = typeof ev["camera"] === "string" ? ev["camera"].trim() : "";
  if (!name) return null;
  if (labels.length > 0) {
    const label = typeof ev["label"] === "string" ? ev["label"] : "";
    if (!labels.includes(label)) return null;
  }
  const want = `camera.${name}`.toLowerCase();
  return cameraIds.find((id) => id.toLowerCase() === want) ?? null;
}
