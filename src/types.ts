// Minimal subset of Home Assistant frontend types used by the card.

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
}

export interface HassEntityRegistryEntry {
  entity_id: string;
  device_id?: string | null;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  entities?: Record<string, HassEntityRegistryEntry>;
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown>;
}

/** A button the user defines inline instead of using a built-in name. */
export interface CustomButtonConfig {
  icon?: string;
  name?: string;
  /** Android TV key sent with remote.send_command, e.g. "DPAD_UP" or "KEYCODE_MENU". */
  command?: string;
  /** Any Home Assistant service, e.g. "script.movie_mode". Used instead of `command`. */
  service?: string;
  data?: Record<string, unknown>;
}

/** An app the user defines inline instead of using a built-in name. */
export interface CustomAppConfig {
  name: string;
  /** Package name or deep link, passed to remote.turn_on as `activity`. */
  activity: string;
  icon?: string;
  color?: string;
  text_color?: string;
}

export type ButtonRef = string | CustomButtonConfig;
export type AppRef = string | CustomAppConfig;

export type RowConfig =
  | string // preset: "dpad", "volume", "volume_slider", "media", "apps", or a single button
  | ButtonRef[] // a row of buttons
  | { buttons: ButtonRef[] }
  | { volume: "buttons" | "slider" }
  | { apps: AppRef[] }
  | { dpad: true | null };

/** One TV or streaming box the card can control. */
export interface DeviceConfig {
  entity: string;
  remote_entity?: string;
  name?: string;
  icon?: string;
}

export interface TclRemoteCardConfig {
  type: string;
  /** A single device. Use `entities` for several. */
  entity?: string;
  remote_entity?: string;
  name?: string;
  /** Several devices, shown as tabs to switch between. */
  entities?: Array<string | DeviceConfig>;
  /** Hide the header with the TV name and state. */
  show_header?: boolean;
  rows?: RowConfig[];
}
