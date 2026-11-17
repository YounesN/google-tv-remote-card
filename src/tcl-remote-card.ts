import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { resolveRows, type ResolvedApp, type ResolvedButton, type ResolvedRow } from "./config";
import { BUTTONS } from "./presets";
import type { HomeAssistant, TclRemoteCardConfig } from "./types";

export const CARD_VERSION = "0.1.0";

console.info(
  `%c TCL-REMOTE-CARD %c v${CARD_VERSION} `,
  "color: white; background: #e4002b; font-weight: 700;",
  "color: #e4002b; background: white; font-weight: 700;",
);

@customElement("tcl-remote-card")
export class TclRemoteCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: TclRemoteCardConfig;
  @state() private _rows: ResolvedRow[] = [];
  /** Volume the user is dragging to, shown until the TV reports back. */
  @state() private _pendingVolume?: number;

  public setConfig(config: TclRemoteCardConfig): void {
    if (!config?.entity || typeof config.entity !== "string" || !config.entity.startsWith("media_player.")) {
      throw new Error("Please set 'entity' to a media_player entity, e.g. media_player.living_room_tv");
    }
    if (config.remote_entity && !config.remote_entity.startsWith("remote.")) {
      throw new Error("'remote_entity' must be a remote entity, e.g. remote.living_room_tv");
    }
    // Throws a readable error for an invalid row, which HA shows in the card.
    this._rows = resolveRows(config);
    this._config = { ...config };
  }

  public getCardSize(): number {
    return this._rows.reduce((size, row) => size + (row.type === "dpad" ? 3 : 1), this._showHeader ? 1 : 0);
  }

  public static getStubConfig(hass: HomeAssistant): Partial<TclRemoteCardConfig> {
    const entity = Object.keys(hass.states).find((id) => id.startsWith("media_player.")) ?? "";
    return { entity };
  }

  private get _showHeader(): boolean {
    return this._config?.show_header !== false;
  }

  /**
   * The remote entity that receives key presses. The Android TV Remote
   * integration creates a media_player and a remote on the same device.
   */
  private get _remoteEntity(): string | undefined {
    if (!this._config || !this.hass) return undefined;
    if (this._config.remote_entity) return this._config.remote_entity;
    const deviceId = this.hass.entities?.[this._config.entity]?.device_id;
    if (deviceId && this.hass.entities) {
      const match = Object.values(this.hass.entities).find(
        (e) => e.device_id === deviceId && e.entity_id.startsWith("remote."),
      );
      if (match) return match.entity_id;
    }
    const guess = this._config.entity.replace(/^media_player\./, "remote.");
    return this.hass.states[guess] ? guess : undefined;
  }

  protected updated(changed: PropertyValues): void {
    // Drop the optimistic slider value once HA reports the new volume.
    if (changed.has("hass") && this._pendingVolume !== undefined && this._config && this.hass) {
      const level = this.hass.states[this._config.entity]?.attributes.volume_level;
      if (typeof level === "number" && Math.abs(level - this._pendingVolume) < 0.011) this._pendingVolume = undefined;
    }
  }

  private _haptic(): void {
    this.dispatchEvent(new CustomEvent("haptic", { detail: "light", bubbles: true, composed: true }));
  }

  private async _press(button: ResolvedButton): Promise<void> {
    if (!this.hass || !this._config) return;
    this._haptic();
    const remote = this._remoteEntity;
    if (button.builtin) {
      await BUTTONS[button.builtin].action?.({ hass: this.hass, mediaPlayer: this._config.entity, remote });
    } else if (button.service) {
      const [domain, service] = button.service.split(".");
      await this.hass.callService(domain, service, button.data ?? {});
    } else if (button.command && remote) {
      await this.hass.callService("remote", "send_command", { entity_id: remote, command: button.command });
    }
  }

  private async _launch(app: ResolvedApp): Promise<void> {
    const remote = this._remoteEntity;
    if (!this.hass || !remote) return;
    this._haptic();
    await this.hass.callService("remote", "turn_on", { entity_id: remote, activity: app.activity });
  }

  private async _setVolume(ev: Event): Promise<void> {
    if (!this.hass || !this._config) return;
    const level = Number((ev.target as HTMLInputElement).value) / 100;
    this._pendingVolume = level;
    await this.hass.callService("media_player", "volume_set", { entity_id: this._config.entity, volume_level: level });
  }

  private _renderButton(button: ResolvedButton, extraClass = ""): TemplateResult {
    const needsRemote = !!button.command && !button.service && !button.builtin;
    const disabled = needsRemote && !this._remoteEntity;
    return html`
      <button
        class="btn ${extraClass} btn-${button.key}"
        title=${button.name}
        aria-label=${button.name}
        ?disabled=${disabled}
        @click=${() => this._press(button)}
      >
        ${button.key === "ok" ? html`<span class="label">OK</span>` : html`<ha-icon .icon=${button.icon}></ha-icon>`}
      </button>
    `;
  }

  private _renderDpad(): TemplateResult {
    const b = (key: string): ResolvedButton => ({ key, ...BUTTONS[key] });
    return html`
      <div class="clickpad">
        ${this._renderButton(b("up"), "pad pad-up")} ${this._renderButton(b("left"), "pad pad-left")}
        ${this._renderButton(b("right"), "pad pad-right")} ${this._renderButton(b("down"), "pad pad-down")}
        ${this._renderButton(b("ok"), "pad-ok")}
      </div>
    `;
  }

  private _renderVolumeButtons(): TemplateResult {
    const b = (key: string): ResolvedButton => ({ key, ...BUTTONS[key] });
    return html`
      <div class="row">
        <div class="capsule">
          ${this._renderButton(b("volume_down"), "seg")}
          <span class="divider"></span>
          ${this._renderButton(b("mute"), "seg")}
          <span class="divider"></span>
          ${this._renderButton(b("volume_up"), "seg")}
        </div>
      </div>
    `;
  }

  private _renderVolumeSlider(): TemplateResult {
    const attrs = this.hass!.states[this._config!.entity]?.attributes ?? {};
    const level = this._pendingVolume ?? (typeof attrs.volume_level === "number" ? attrs.volume_level : undefined);
    const supported = level !== undefined;
    const muted = !!attrs.is_volume_muted;
    const pct = Math.round((level ?? 0) * 100);
    const mute: ResolvedButton = { key: "mute", ...BUTTONS.mute };
    return html`
      <div class="volume-slider">
        <div class="slider ${pct >= 18 ? "filled" : ""}" style="--pct: ${pct}%">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            aria-label="Volume"
            .value=${String(pct)}
            ?disabled=${!supported}
            @input=${(ev: Event) => (this._pendingVolume = Number((ev.target as HTMLInputElement).value) / 100)}
            @change=${this._setVolume}
          />
          <ha-icon class="slider-icon" .icon=${pct === 0 || muted ? "mdi:volume-off" : pct < 50 ? "mdi:volume-medium" : "mdi:volume-high"}></ha-icon>
          <span class="slider-value">${supported ? pct : "–"}</span>
        </div>
        ${this._renderButton({ ...mute, icon: muted ? "mdi:volume-off" : "mdi:volume-mute" }, muted ? "active" : "")}
      </div>
    `;
  }

  private _renderApps(apps: ResolvedApp[]): TemplateResult {
    const disabled = !this._remoteEntity;
    return html`
      <div class="apps">
        ${apps.map(
          (app) => html`
            <button
              class="app"
              style="--app-color: ${app.color}; --app-text-color: ${app.text_color ?? "#fff"}"
              title=${app.name}
              ?disabled=${disabled}
              @click=${() => this._launch(app)}
            >
              ${app.icon ? html`<ha-icon .icon=${app.icon}></ha-icon>` : nothing}
              <span>${app.name}</span>
            </button>
          `,
        )}
      </div>
    `;
  }

  private _renderRow(row: ResolvedRow): TemplateResult {
    switch (row.type) {
      case "buttons":
        return html`<div class="row">${row.buttons.map((b) => this._renderButton(b))}</div>`;
      case "dpad":
        return this._renderDpad();
      case "volume_slider":
        return this._renderVolumeSlider();
      case "volume_buttons":
        return this._renderVolumeButtons();
      case "apps":
        return this._renderApps(row.apps);
    }
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;
    const stateObj = this.hass.states[this._config.entity];
    if (!stateObj) {
      return html`<ha-card><div class="warning">Entity not found: ${this._config.entity}</div></ha-card>`;
    }
    const name = this._config.name ?? stateObj.attributes.friendly_name ?? this._config.entity;
    const isOn = !["off", "unavailable", "unknown", "standby"].includes(stateObj.state);
    return html`
      <ha-card class=${isOn ? "on" : "off"}>
        ${this._showHeader
          ? html`<div class="header">
              <span class="name">${name}</span>
              <span class="state">${stateObj.attributes.app_name ?? stateObj.state}</span>
            </div>`
          : nothing}
        ${this._remoteEntity
          ? nothing
          : html`<div class="warning">
              No remote entity found for ${this._config.entity}. Set <code>remote_entity</code> in the card config.
            </div>`}
        <div class="rows">${this._rows.map((row) => this._renderRow(row))}</div>
      </ha-card>
    `;
  }

  static styles = css`
    :host {
      --tcl-btn-size: 56px;
      --tcl-ink: var(--primary-text-color, #1c1c1e);
      --tcl-surface: color-mix(in srgb, var(--tcl-ink) 8%, transparent);
      --tcl-surface-raised: color-mix(in srgb, var(--tcl-ink) 12%, transparent);
      --tcl-surface-pressed: color-mix(in srgb, var(--tcl-ink) 22%, transparent);
      --tcl-accent: var(--primary-color, #0a84ff);
      --tcl-red: #ff3b30;
      --tcl-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", var(--paper-font-body1_-_font-family, Roboto), sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    ha-card {
      padding: 20px;
      border-radius: var(--ha-card-border-radius, 24px);
      overflow: hidden;
    }
    ha-icon {
      --mdc-icon-size: 24px;
      display: inline-flex;
      pointer-events: none;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 18px;
    }
    .name {
      font-size: 1.25em;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .state {
      font-size: 0.85em;
      font-weight: 500;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--tcl-surface);
      color: var(--secondary-text-color);
      text-transform: capitalize;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 50%;
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .row {
      display: flex;
      justify-content: space-evenly;
      align-items: center;
      gap: 10px;
    }

    /* Round, translucent buttons with a soft press animation. */
    .btn {
      width: var(--tcl-btn-size);
      height: var(--tcl-btn-size);
      flex: 0 0 auto;
      border-radius: 50%;
      border: none;
      padding: 0;
      background: var(--tcl-surface);
      color: var(--tcl-ink);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      transition: transform 0.25s var(--tcl-ease), background-color 0.2s ease, filter 0.2s ease;
    }
    .btn:hover:not([disabled]) {
      background: var(--tcl-surface-raised);
    }
    .btn:active:not([disabled]) {
      transform: scale(0.9);
      background: var(--tcl-surface-pressed);
      transition-duration: 0.08s;
    }
    .btn:focus-visible,
    .app:focus-visible {
      outline: 2px solid var(--tcl-accent);
      outline-offset: 2px;
    }
    .btn[disabled],
    .app[disabled],
    input[disabled] {
      opacity: 0.35;
      cursor: not-allowed;
    }
    .btn.active {
      background: var(--tcl-accent);
      color: #fff;
    }
    .btn-power {
      background: var(--tcl-red);
      color: #fff;
    }
    .btn-power:hover:not([disabled]),
    .btn-power:active:not([disabled]) {
      background: var(--tcl-red);
      filter: brightness(1.1);
    }
    .off .btn-power {
      background: var(--tcl-surface);
      color: var(--tcl-red);
    }

    /* Apple TV style clickpad: one disc with four directions and a center. */
    .clickpad {
      position: relative;
      width: 216px;
      height: 216px;
      margin: 0 auto;
      border-radius: 50%;
      background: var(--tcl-surface);
      box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 18%, transparent);
    }
    .clickpad .pad {
      position: absolute;
      width: 72px;
      height: 72px;
      background: transparent;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      color: color-mix(in srgb, var(--tcl-ink) 70%, transparent);
    }
    .clickpad .pad:hover:not([disabled]) {
      background: transparent;
      color: var(--tcl-ink);
    }
    .clickpad .pad:active:not([disabled]) {
      transform: scale(0.85);
      background: var(--tcl-surface);
    }
    .pad-up {
      top: 4px;
      left: 72px;
    }
    .pad-down {
      bottom: 4px;
      left: 72px;
    }
    .pad-left {
      left: 4px;
      top: 72px;
    }
    .pad-right {
      right: 4px;
      top: 72px;
    }
    .clickpad .pad-ok {
      position: absolute;
      top: 64px;
      left: 64px;
      width: 88px;
      height: 88px;
      background: var(--tcl-surface-raised);
      box-shadow:
        0 1px 3px color-mix(in srgb, #000 15%, transparent),
        inset 0 1px 0 color-mix(in srgb, #fff 20%, transparent);
    }
    .pad-ok .label {
      font-weight: 600;
      font-size: 0.95em;
      letter-spacing: 0.04em;
      color: color-mix(in srgb, var(--tcl-ink) 75%, transparent);
    }

    /* Volume as a segmented capsule. */
    .capsule {
      display: flex;
      align-items: center;
      border-radius: 999px;
      background: var(--tcl-surface);
      padding: 0 4px;
    }
    .capsule .seg {
      width: 72px;
      background: transparent;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      border-radius: 999px;
    }
    .capsule .seg:hover:not([disabled]) {
      background: transparent;
    }
    .capsule .seg:active:not([disabled]) {
      background: var(--tcl-surface);
    }
    .divider {
      width: 1px;
      height: 24px;
      background: color-mix(in srgb, var(--tcl-ink) 15%, transparent);
    }

    /* Control Center style slider: a thick rounded bar that fills. */
    .volume-slider {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .slider {
      position: relative;
      flex: 1;
      height: var(--tcl-btn-size);
      border-radius: 18px;
      overflow: hidden;
      background: var(--tcl-surface);
    }
    .slider input {
      -webkit-appearance: none;
      appearance: none;
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      cursor: pointer;
      background: linear-gradient(to right, var(--tcl-accent) var(--pct), transparent var(--pct));
    }
    .slider input::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 1px;
      height: var(--tcl-btn-size);
      background: transparent;
    }
    .slider input::-moz-range-thumb {
      width: 1px;
      height: var(--tcl-btn-size);
      border: 0;
      background: transparent;
    }
    .slider-icon,
    .slider-value {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
      color: var(--secondary-text-color);
    }
    .slider.filled .slider-icon {
      color: #fff;
    }
    .slider-icon {
      left: 16px;
    }
    .slider-value {
      right: 16px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    /* App tiles: rounded squares with a soft highlight. */
    .apps {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
      gap: 10px;
    }
    .app {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 52px;
      padding: 6px 8px;
      border: none;
      border-radius: 16px;
      background:
        linear-gradient(180deg, color-mix(in srgb, #fff 22%, transparent), transparent 60%),
        var(--app-color);
      color: var(--app-text-color, #fff);
      font: inherit;
      font-weight: 650;
      font-size: 0.85em;
      letter-spacing: -0.01em;
      line-height: 1.15;
      cursor: pointer;
      box-shadow:
        0 1px 2px color-mix(in srgb, #000 18%, transparent),
        0 4px 12px -4px color-mix(in srgb, var(--app-color) 60%, transparent);
      -webkit-tap-highlight-color: transparent;
      transition: transform 0.25s var(--tcl-ease), filter 0.2s ease;
    }
    .app:hover:not([disabled]) {
      filter: brightness(1.08);
    }
    .app:active:not([disabled]) {
      transform: scale(0.94);
      transition-duration: 0.08s;
    }
    .warning {
      padding: 0 0 12px;
      color: var(--error-color, #db4437);
    }
  `;
}

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
  interface HTMLElementTagNameMap {
    "tcl-remote-card": TclRemoteCard;
  }
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "tcl-remote-card",
  name: "TCL Remote Card",
  description: "A configurable remote for TCL Google TV / Android TV",
  preview: true,
  documentationURL: "https://github.com/YounesN/tcl-remote-card",
});
