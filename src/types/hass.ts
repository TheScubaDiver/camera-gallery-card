/**
 * Re-export the canonical Home Assistant typing surface in one place.
 *
 * Card and editor code should import HA types from "./types/hass" rather than
 * directly from custom-card-helpers / home-assistant-js-websocket so we can
 * swap or augment the source if needed.
 */

export type {
  ActionConfig,
  CurrentUser,
  FrontendLocaleData,
  HomeAssistant,
  LocalizeFunc,
  LovelaceCard,
  LovelaceCardConfig,
  LovelaceCardEditor,
} from "custom-card-helpers";

export type {
  HassConfig,
  HassEntities,
  HassEntity,
  HassServices,
  HassServiceTarget,
  MessageBase,
  UnsubscribeFunc,
} from "home-assistant-js-websocket";
