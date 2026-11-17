import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
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

  public setConfig(config: TclRemoteCardConfig): void {
    if (!config?.entity || !config.entity.startsWith("media_player.")) {
      throw new Error("Please set 'entity' to a media_player entity, e.g. media_player.living_room_tv");
    }
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 6;
  }

  public static getStubConfig(hass: HomeAssistant): Partial<TclRemoteCardConfig> {
    const entity = Object.keys(hass.states).find((id) => id.startsWith("media_player.")) ?? "";
    return { entity };
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;
    const stateObj = this.hass.states[this._config.entity];
    if (!stateObj) {
      return html`<ha-card><div class="warning">Entity not found: ${this._config.entity}</div></ha-card>`;
    }
    const name = this._config.name ?? stateObj.attributes.friendly_name ?? this._config.entity;
    return html`
      <ha-card .header=${name}>
        <div class="content">State: ${stateObj.state}</div>
      </ha-card>
    `;
  }

  static styles = css`
    .content {
      padding: 0 16px 16px;
    }
    .warning {
      padding: 16px;
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
