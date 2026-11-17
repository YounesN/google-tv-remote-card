import { APPS, BUTTONS, DEFAULT_APPS, MEDIA_BUTTONS, VOLUME_BUTTONS } from "./presets";
import type { AppRef, ButtonRef, RowConfig, TclRemoteCardConfig } from "./types";

export interface ResolvedButton {
  key: string;
  icon: string;
  name: string;
  command?: string;
  service?: string;
  data?: Record<string, unknown>;
  /** Name of a built-in button whose custom action should run. */
  builtin?: string;
}

export interface ResolvedApp {
  name: string;
  activity: string;
  color: string;
  text_color?: string;
  icon?: string;
}

export type ResolvedRow =
  | { type: "buttons"; buttons: ResolvedButton[] }
  | { type: "dpad" }
  | { type: "volume_slider" }
  | { type: "apps"; apps: ResolvedApp[] };

export const DEFAULT_ROWS: RowConfig[] = [
  ["power", "source", "home", "back"],
  "dpad",
  { volume: "buttons" },
  "media",
  { apps: DEFAULT_APPS },
];

function resolveButton(ref: ButtonRef, index: number): ResolvedButton {
  if (typeof ref === "string") {
    const def = BUTTONS[ref];
    if (!def) {
      throw new Error(`Unknown button "${ref}". Valid buttons: ${Object.keys(BUTTONS).join(", ")}`);
    }
    return { key: ref, icon: def.icon, name: def.name, command: def.command, builtin: def.action ? ref : undefined };
  }
  if (!ref || typeof ref !== "object" || (!ref.command && !ref.service)) {
    throw new Error("A custom button needs either `command` (an Android TV key) or `service`.");
  }
  if (ref.service && !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(ref.service)) {
    throw new Error(`Invalid service "${ref.service}". Use the form domain.service, e.g. script.turn_on.`);
  }
  return {
    key: `custom-${index}`,
    icon: ref.icon ?? "mdi:gesture-tap-button",
    name: ref.name ?? ref.command ?? ref.service ?? "Button",
    command: ref.command,
    service: ref.service,
    data: ref.data,
  };
}

function resolveApp(ref: AppRef): ResolvedApp {
  if (typeof ref === "string") {
    const def = APPS[ref];
    if (!def) {
      throw new Error(`Unknown app "${ref}". Valid apps: ${Object.keys(APPS).join(", ")}. Or define one with name and activity.`);
    }
    return { ...def };
  }
  if (!ref || typeof ref !== "object" || !ref.name || !ref.activity) {
    throw new Error("A custom app needs `name` and `activity` (package name or deep link).");
  }
  return { name: ref.name, activity: ref.activity, color: ref.color ?? "var(--primary-color)", text_color: ref.text_color, icon: ref.icon };
}

const buttonRow = (refs: ButtonRef[]): ResolvedRow => {
  if (!refs.length) throw new Error("A button row can't be empty.");
  return { type: "buttons", buttons: refs.map(resolveButton) };
};

export function resolveRow(row: RowConfig): ResolvedRow {
  if (typeof row === "string") {
    switch (row) {
      case "dpad":
        return { type: "dpad" };
      case "volume":
      case "volume_buttons":
        return buttonRow(VOLUME_BUTTONS);
      case "volume_slider":
        return { type: "volume_slider" };
      case "media":
        return buttonRow(MEDIA_BUTTONS);
      case "apps":
        return { type: "apps", apps: DEFAULT_APPS.map(resolveApp) };
      default:
        // A single built-in button on its own row.
        return buttonRow([row]);
    }
  }
  if (Array.isArray(row)) return buttonRow(row);
  if (row && typeof row === "object") {
    if ("buttons" in row) return buttonRow(row.buttons ?? []);
    if ("dpad" in row) return { type: "dpad" };
    if ("volume" in row) {
      if (row.volume === "slider") return { type: "volume_slider" };
      if (row.volume === "buttons" || row.volume == null) return buttonRow(VOLUME_BUTTONS);
      throw new Error(`volume must be "buttons" or "slider", got "${row.volume}".`);
    }
    if ("apps" in row) {
      const apps = row.apps ?? DEFAULT_APPS;
      if (!Array.isArray(apps) || !apps.length) throw new Error("apps must be a non-empty list.");
      return { type: "apps", apps: apps.map(resolveApp) };
    }
  }
  throw new Error(`Couldn't understand row: ${JSON.stringify(row)}`);
}

export function resolveRows(config: TclRemoteCardConfig): ResolvedRow[] {
  const rows = config.rows ?? DEFAULT_ROWS;
  if (!Array.isArray(rows)) throw new Error("rows must be a list.");
  return rows.map(resolveRow);
}
