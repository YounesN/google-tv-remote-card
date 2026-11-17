import type { HomeAssistant } from "./types";

export interface ButtonDef {
  icon: string;
  name: string;
  /** Key for remote.send_command. */
  command?: string;
  /** Custom action, used instead of `command`. */
  action?: (ctx: ActionContext) => Promise<unknown>;
}

export interface ActionContext {
  hass: HomeAssistant;
  mediaPlayer: string;
  remote?: string;
}

export interface AppDef {
  name: string;
  activity: string;
  color: string;
  /** Label color, for brands with a light background. Defaults to white. */
  text_color?: string;
  icon?: string;
  /** Short text shown in the tile when there's no logo. */
  badge?: string;
}

/**
 * Built-in buttons. Commands are Android TV key codes understood by the
 * Android TV Remote integration's remote.send_command.
 */
export const BUTTONS: Record<string, ButtonDef> = {
  power: {
    icon: "mdi:power",
    name: "Power",
    action: ({ hass, mediaPlayer }) => hass.callService("media_player", "toggle", { entity_id: mediaPlayer }),
  },
  source: { icon: "mdi:import", name: "Input", command: "TV_INPUT" },
  home: { icon: "mdi:home-outline", name: "Home", command: "HOME" },
  back: { icon: "mdi:arrow-left", name: "Back", command: "BACK" },
  menu: { icon: "mdi:menu", name: "Menu", command: "MENU" },
  settings: { icon: "mdi:cog-outline", name: "Settings", command: "SETTINGS" },
  info: { icon: "mdi:information-outline", name: "Info", command: "INFO" },
  guide: { icon: "mdi:television-guide", name: "Guide", command: "GUIDE" },
  search: { icon: "mdi:magnify", name: "Search", command: "SEARCH" },
  assistant: { icon: "mdi:microphone", name: "Assistant", command: "ASSIST" },
  captions: { icon: "mdi:closed-caption", name: "Captions", command: "CAPTIONS" },

  up: { icon: "mdi:chevron-up", name: "Up", command: "DPAD_UP" },
  down: { icon: "mdi:chevron-down", name: "Down", command: "DPAD_DOWN" },
  left: { icon: "mdi:chevron-left", name: "Left", command: "DPAD_LEFT" },
  right: { icon: "mdi:chevron-right", name: "Right", command: "DPAD_RIGHT" },
  ok: { icon: "mdi:circle-outline", name: "OK", command: "DPAD_CENTER" },

  volume_up: { icon: "mdi:volume-plus", name: "Volume up", command: "VOLUME_UP" },
  volume_down: { icon: "mdi:volume-minus", name: "Volume down", command: "VOLUME_DOWN" },
  mute: { icon: "mdi:volume-mute", name: "Mute", command: "MUTE" },
  channel_up: { icon: "mdi:arrow-up-bold", name: "Channel up", command: "CHANNEL_UP" },
  channel_down: { icon: "mdi:arrow-down-bold", name: "Channel down", command: "CHANNEL_DOWN" },

  play_pause: { icon: "mdi:play-pause", name: "Play/Pause", command: "MEDIA_PLAY_PAUSE" },
  play: { icon: "mdi:play", name: "Play", command: "MEDIA_PLAY" },
  pause: { icon: "mdi:pause", name: "Pause", command: "MEDIA_PAUSE" },
  stop: { icon: "mdi:stop", name: "Stop", command: "MEDIA_STOP" },
  rewind: { icon: "mdi:rewind", name: "Rewind", command: "MEDIA_REWIND" },
  fast_forward: { icon: "mdi:fast-forward", name: "Fast forward", command: "MEDIA_FAST_FORWARD" },
  previous: { icon: "mdi:skip-previous", name: "Previous", command: "MEDIA_PREVIOUS" },
  next: { icon: "mdi:skip-next", name: "Next", command: "MEDIA_NEXT" },
};

/**
 * Built-in apps, launched with remote.turn_on(activity=...). Deep links are
 * used where the Android TV Remote docs recommend them; otherwise the
 * Android TV package name.
 */
export const APPS: Record<string, AppDef> = {
  netflix: { name: "Netflix", activity: "https://www.netflix.com/title", color: "#e50914" },
  youtube: { name: "YouTube", activity: "https://www.youtube.com", color: "#ff0000" },
  youtube_music: { name: "YT Music", activity: "com.google.android.youtube.tvmusic", color: "#ff0000" },
  prime_video: { name: "Prime Video", activity: "https://app.primevideo.com", color: "#00a8e1", badge: "prime" },
  disney_plus: { name: "Disney+", activity: "https://www.disneyplus.com", color: "#113ccf", badge: "D+" },
  hulu: { name: "Hulu", activity: "com.hulu.livingroomplus", color: "#1ce783", text_color: "#0b0c0f", badge: "hulu" },
  max: { name: "HBO Max", activity: "com.wbd.stream", color: "#000000" },
  apple_tv: { name: "Apple TV", activity: "com.apple.atve.androidtv.appletv", color: "#000000" },
  paramount_plus: { name: "Paramount+", activity: "com.cbs.ott", color: "#0064ff" },
  peacock: { name: "Peacock", activity: "com.peacocktv.peacockandroid", color: "#000000", badge: "P" },
  plex: { name: "Plex", activity: "com.plexapp.android", color: "#e5a00d" },
  spotify: { name: "Spotify", activity: "com.spotify.tv.android", color: "#1db954" },
  twitch: { name: "Twitch", activity: "tv.twitch.android.app", color: "#9146ff" },
  crunchyroll: { name: "Crunchyroll", activity: "com.crunchyroll.crunchyroid", color: "#f47521" },
  google_tv: { name: "Google TV", activity: "com.google.android.videos", color: "#4285f4" },
};

export const DEFAULT_APPS = ["netflix", "youtube", "prime_video", "disney_plus"];
export const MEDIA_BUTTONS = ["rewind", "play_pause", "fast_forward"];
