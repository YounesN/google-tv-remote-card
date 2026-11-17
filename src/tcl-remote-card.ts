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
        <ha-icon .icon=${button.icon}></ha-icon>
      </button>
    `;
  }

  private _renderDpad(): TemplateResult {
    const b = (key: string): ResolvedButton => ({ key, ...BUTTONS[key] });
    return html`
      <div class="dpad">
        ${this._renderButton(b("up"), "dpad-up")} ${this._renderButton(b("left"), "dpad-left")}
        ${this._renderButton(b("ok"), "dpad-ok")} ${this._renderButton(b("right"), "dpad-right")}
        ${this._renderButton(b("down"), "dpad-down")}
      </div>
    `;
  }

  private _renderVolumeSlider(): TemplateResult {
    const attrs = this.hass!.states[this._config!.entity]?.attributes ?? {};
    const level = this._pendingVolume ?? (typeof attrs.volume_level === "number" ? attrs.volume_level : undefined);
    const supported = level !== undefined;
    const muted = !!attrs.is_volume_muted;
    const mute: ResolvedButton = { key: "mute", ...BUTTONS.mute };
    return html`
      <div class="volume-slider">
        ${this._renderButton({ ...mute, icon: muted ? "mdi:volume-off" : "mdi:volume-high" })}
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          aria-label="Volume"
          .value=${String(Math.round((level ?? 0) * 100))}
          ?disabled=${!supported}
          @change=${this._setVolume}
        />
        <span class="volume-value">${supported ? Math.round(level! * 100) : "–"}</span>
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
      --btn-size: 48px;
      --btn-bg: var(--secondary-background-color, rgba(127, 127, 127, 0.12));
      --btn-color: var(--primary-text-color);
    }
    ha-card {
      padding: 16px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 12px;
    }
    .name {
      font-size: 1.2em;
      font-weight: 500;
    }
    .state {
      color: var(--secondary-text-color);
      text-transform: capitalize;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .row {
      display: flex;
      justify-content: space-evenly;
      gap: 8px;
    }
    .btn {
      width: var(--btn-size);
      height: var(--btn-size);
      border-radius: 50%;
      border: none;
      background: var(--btn-bg);
      color: var(--btn-color);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      transition: transform 0.08s ease, background 0.15s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .btn:active:not([disabled]) {
      transform: scale(0.92);
    }
    .btn[disabled],
    .app[disabled] {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .on .btn-power {
      color: var(--state-active-color, var(--primary-color));
    }
    .off .btn-power {
      color: var(--error-color, #db4437);
    }
    .dpad {
      display: grid;
      grid-template-columns: repeat(3, var(--btn-size));
      grid-template-rows: repeat(3, var(--btn-size));
      gap: 6px;
      justify-content: center;
    }
    .dpad-up {
      grid-area: 1 / 2;
    }
    .dpad-left {
      grid-area: 2 / 1;
    }
    .dpad-ok {
      grid-area: 2 / 2;
      background: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
    }
    .dpad-right {
      grid-area: 2 / 3;
    }
    .dpad-down {
      grid-area: 3 / 2;
    }
    .volume-slider {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .volume-slider input {
      flex: 1;
      accent-color: var(--primary-color);
    }
    .volume-value {
      min-width: 2.5em;
      text-align: right;
      color: var(--secondary-text-color);
    }
    .apps {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
      gap: 8px;
    }
    .app {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 40px;
      padding: 6px 10px;
      border: none;
      border-radius: 10px;
      background: var(--app-color);
      color: var(--app-text-color, #fff);
      font-weight: 600;
      font-size: 0.9em;
      cursor: pointer;
    }
    .app:active:not([disabled]) {
      transform: scale(0.96);
    }
    .warning {
      padding: 8px 0;
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
