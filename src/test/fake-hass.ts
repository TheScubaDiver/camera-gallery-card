/**
 * Hand-rolled `HomeAssistant` fake for vitest specs. Mirrors the
 * `MemoryStorage` precedent in `favorites.spec.ts`: state-bearing fakes
 * preferred over `vi.mock`, so tests stay legible and the surface is
 * exactly the slice the data clients touch.
 *
 * Coverage target — every method listed here is one the data layer or
 * delete-service helpers actually call:
 * - `states[entityId].attributes.fileList` (sensor ingestion)
 * - `callWS({ type: "media_source/browse_media", … })` (media walker)
 * - `callWS({ type: "media_source/resolve_media", … })` (media walker)
 * - `callWS({ type: "auth/sign_path", … })` (live + Frigate REST)
 * - `callService(domain, service, data)` (delete + filetrack wizard)
 * - `connection.subscribeMessage(cb, payload)` (Frigate event push)
 * - `auth.data.access_token` (protected fetch)
 *
 * Anything not in that list is intentionally absent. Add narrowly when a
 * spec needs it; don't pre-emptively grow the fake.
 */

import type { HassEntities, HassEntity, HomeAssistant } from "../types/hass";

/** Recorded `callService` invocation; assert against `hass.serviceCalls`. */
export interface RecordedServiceCall {
  domain: string;
  service: string;
  data: Record<string, unknown> | undefined;
}

/** Routes `callWS` by `type`. Return whatever the WS would return. */
export type WsHandler = (payload: { type: string; [k: string]: unknown }) => unknown;

export interface FakeHass extends HomeAssistant {
  /** Set or replace an entity's state. Pass `undefined` to delete. */
  setState(entityId: string, attributes: Record<string, unknown> | undefined): void;
  /** Register a `callWS` handler keyed by message `type`. */
  registerWs(type: string, handler: WsHandler): void;
  /** All `callService` invocations, in call order. */
  serviceCalls: RecordedServiceCall[];
  /** Enqueue a Frigate event-push payload that the next subscriber will see. */
  emitFrigateEvent(payload: unknown): void;
}

interface FakeHassOptions {
  /** Initial entity states. Keyed by `entityId`. */
  states?: Record<string, Record<string, unknown>>;
  /** Initial WS handlers. Keyed by message `type`. */
  ws?: Record<string, WsHandler>;
  /** Override the auth token surfaced via `hass.auth.data.access_token`. */
  accessToken?: string;
}

/**
 * Build a `FakeHass` instance. The returned object is mutable — tests can
 * call `setState` / `registerWs` after construction without rebuilding.
 *
 * `callWS` rejects with a clear error if no handler is registered for the
 * requested `type` so missing setup surfaces as a test failure rather than
 * as silent `undefined`.
 */
export function makeFakeHass(opts: FakeHassOptions = {}): FakeHass {
  const states: HassEntities = {};
  const wsHandlers = new Map<string, WsHandler>();
  const serviceCalls: RecordedServiceCall[] = [];
  const frigateSubscribers = new Set<(msg: unknown) => void>();
  const pendingFrigateEvents: unknown[] = [];

  const setState = (entityId: string, attributes: Record<string, unknown> | undefined): void => {
    if (attributes === undefined) {
      delete states[entityId];
      return;
    }
    states[entityId] = makeEntity(entityId, attributes);
  };

  for (const [id, attrs] of Object.entries(opts.states ?? {})) {
    setState(id, attrs);
  }
  for (const [type, handler] of Object.entries(opts.ws ?? {})) {
    wsHandlers.set(type, handler);
  }

  const callWS = async (payload: { type: string; [k: string]: unknown }): Promise<unknown> => {
    const handler = wsHandlers.get(payload.type);
    if (!handler) throw new Error(`FakeHass: no WS handler registered for "${payload.type}"`);
    return handler(payload);
  };

  const callService = async (
    domain: string,
    service: string,
    data?: Record<string, unknown>
  ): Promise<void> => {
    serviceCalls.push({ domain, service, data });
  };

  const subscribeMessage = async (
    cb: (msg: unknown) => void,
    _payload: unknown
  ): Promise<() => void> => {
    frigateSubscribers.add(cb);
    while (pendingFrigateEvents.length) {
      const ev = pendingFrigateEvents.shift();
      cb(ev);
    }
    return () => {
      frigateSubscribers.delete(cb);
    };
  };

  const emitFrigateEvent = (payload: unknown): void => {
    if (frigateSubscribers.size === 0) {
      pendingFrigateEvents.push(payload);
      return;
    }
    for (const cb of frigateSubscribers) cb(payload);
  };

  // The `as unknown as HomeAssistant` cast: HomeAssistant from
  // custom-card-helpers carries dozens of fields (themes, services config,
  // localize, etc.) that the data layer doesn't touch. Listing them all here
  // would obscure the actual surface under test. The cast is the canonical
  // pattern in the HA card ecosystem (mushroom + button-card both do it).
  const hass = {
    states,
    callWS,
    callService,
    connection: { subscribeMessage },
    auth: { data: { access_token: opts.accessToken ?? "test-token" } },
    setState,
    registerWs: (type: string, handler: WsHandler) => wsHandlers.set(type, handler),
    serviceCalls,
    emitFrigateEvent,
  } as unknown as FakeHass;

  return hass;
}

function makeEntity(entityId: string, attributes: Record<string, unknown>): HassEntity {
  return {
    entity_id: entityId,
    state: "on",
    attributes,
    last_changed: "1970-01-01T00:00:00+00:00",
    last_updated: "1970-01-01T00:00:00+00:00",
    context: { id: "test", parent_id: null, user_id: null },
  };
}
