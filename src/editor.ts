import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { DEFAULT_ROWS } from "./config";
import { APPS, BUTTONS, DEFAULT_APPS } from "./presets";
import type { DeviceConfig, GoogleTvRemoteCardConfig, HomeAssistant, RowConfig } from "./types";

/** A row as the visual editor sees it. */
type EditorRow =
  | { type: "buttons"; buttons: string[] }
  | { type: "dpad" }
  | { type: "volume_buttons" }
  | { type: "volume_slider" }
  | { type: "media" }
  | { type: "apps"; apps: string[] }
  /** A row with custom buttons or apps. Kept as written, edited in YAML. */
  | { type: "custom"; raw: RowConfig };

const ROW_TYPES: Array<{ value: EditorRow["type"]; label: string }> = [
  { value: "buttons", label: "Buttons" },
  { value: "dpad", label: "D-pad (clickpad)" },
  { value: "volume_buttons", label: "Volume buttons" },
  { value: "volume_slider", label: "Volume slider" },
  { value: "media", label: "Media controls" },
  { value: "apps", label: "Apps" },
];

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === "string");

/** Converts a row from the card config into the editor's model. */
export function toEditorRow(row: RowConfig): EditorRow {
  if (typeof row === "string") {
    switch (row) {
      case "dpad":
        return { type: "dpad" };
      case "volume":
      case "volume_buttons":
        return { type: "volume_buttons" };
      case "volume_slider":
        return { type: "volume_slider" };
      case "media":
        return { type: "media" };
      case "apps":
        return { type: "apps", apps: [...DEFAULT_APPS] };
      default:
        return { type: "buttons", buttons: [row] };
    }
  }
  if (isStringList(row)) return { type: "buttons", buttons: [...row] };
  if (row && typeof row === "object" && !Array.isArray(row)) {
    if ("buttons" in row && isStringList(row.buttons)) return { type: "buttons", buttons: [...row.buttons] };
    if ("dpad" in row) return { type: "dpad" };
    if ("volume" in row) return { type: row.volume === "slider" ? "volume_slider" : "volume_buttons" };
    if ("apps" in row && (row.apps == null || isStringList(row.apps))) {
      return { type: "apps", apps: [...(row.apps ?? DEFAULT_APPS)] };
    }
  }
  return { type: "custom", raw: row };
}

/** Converts an editor row back into the card's YAML shape. */
export function fromEditorRow(row: EditorRow): RowConfig {
  switch (row.type) {
    case "buttons":
      return [...row.buttons];
    case "dpad":
      return "dpad";
    case "volume_buttons":
      return { volume: "buttons" };
    case "volume_slider":
      return { volume: "slider" };
    case "media":
      return "media";
    case "apps":
      return { apps: [...row.apps] };
    case "custom":
      return row.raw;
  }
}

function defaultRowOfType(type: EditorRow["type"]): EditorRow {
  switch (type) {
    case "buttons":
      return { type: "buttons", buttons: ["power", "home", "back"] };
    case "apps":
      return { type: "apps", apps: [...DEFAULT_APPS] };
    case "custom":
      return { type: "buttons", buttons: ["home"] };
    default:
      return { type } as EditorRow;
  }
}

const deviceEntity = (d: string | DeviceConfig): string => (typeof d === "string" ? d : d.entity);

/**
 * Loads Home Assistant's form elements, which are only defined once a
 * built-in card editor has been opened.
 */
async function ensureHaForm(): Promise<void> {
  if (customElements.get("ha-form") && customElements.get("ha-entity-picker")) return;
  try {
    const helpers = await (window as any).loadCardHelpers?.();
    const card = helpers?.createCardElement?.({ type: "entities", entities: [] });
    await card?.constructor?.getConfigElement?.();
  } catch {
    // Older or unusual frontends: ha-form usually exists anyway.
  }
}

export class GoogleTvRemoteCardEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: GoogleTvRemoteCardConfig;
  @state() private _ready = false;

  public setConfig(config: GoogleTvRemoteCardConfig): void {
    this._config = { ...config };
  }

  connectedCallback(): void {
    super.connectedCallback();
    ensureHaForm().then(() => (this._ready = true));
  }

  // ---- devices -------------------------------------------------------------

  private get _deviceEntities(): string[] {
    const c = this._config!;
    const list: string[] = [];
    if (c.entity) list.push(c.entity);
    for (const d of c.entities ?? []) {
      const e = deviceEntity(d);
      if (e && !list.includes(e)) list.push(e);
    }
    return list;
  }

  /** Existing per-device settings (name, icon, remote_entity), so editing the list keeps them. */
  private _deviceSettings(entity: string): DeviceConfig | undefined {
    const c = this._config!;
    if (c.entity === entity) return { entity, name: c.name, remote_entity: c.remote_entity };
    const found = (c.entities ?? []).find((d) => deviceEntity(d) === entity);
    return typeof found === "object" ? found : undefined;
  }

  private _setDevices(entities: string[]): void {
    const config: GoogleTvRemoteCardConfig = { ...this._config! };
    const clean = entities.filter((e) => typeof e === "string" && e);
    delete config.entity;
    delete config.entities;
    delete config.remote_entity;
    if (clean.length === 1) {
      const s = this._deviceSettings(clean[0]);
      config.entity = clean[0];
      if (s?.remote_entity) config.remote_entity = s.remote_entity;
      // Keep a card-level name only for a single device.
      if (s?.name) config.name = s.name;
    } else if (clean.length > 1) {
      delete config.name;
      config.entities = clean.map((e) => {
        const s = this._deviceSettings(e);
        if (!s) return e;
        const out: DeviceConfig = { entity: e };
        if (s.name) out.name = s.name;
        if (s.icon) out.icon = s.icon;
        if (s.remote_entity) out.remote_entity = s.remote_entity;
        return Object.keys(out).length === 1 ? e : out;
      });
    }
    this._emit(this._withOrderedKeys(config));
  }

  // ---- rows ----------------------------------------------------------------

  private get _rows(): EditorRow[] {
    return (this._config!.rows ?? DEFAULT_ROWS).map(toEditorRow);
  }

  private _setRows(rows: EditorRow[]): void {
    this._emit({ ...this._config!, rows: rows.map(fromEditorRow) });
  }

  private _updateRow(index: number, row: EditorRow): void {
    const rows = this._rows;
    rows[index] = row;
    this._setRows(rows);
  }

  private _moveRow(index: number, delta: number): void {
    const rows = this._rows;
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    this._setRows(rows);
  }

  private _removeRow(index: number): void {
    const rows = this._rows;
    rows.splice(index, 1);
    this._setRows(rows);
  }

  private _addRow(): void {
    this._setRows([...this._rows, defaultRowOfType("buttons")]);
  }

  // ---- plumbing ------------------------------------------------------------

  /** Keeps the YAML readable: type, devices and options first, rows last. */
  private _withOrderedKeys(config: GoogleTvRemoteCardConfig): GoogleTvRemoteCardConfig {
    const order = ["type", "entity", "remote_entity", "entities", "name", "show_header", "rows"];
    const out: Record<string, unknown> = {};
    for (const key of order) if (key in config) out[key] = (config as any)[key];
    for (const [key, value] of Object.entries(config)) if (!(key in out)) out[key] = value;
    return out as unknown as GoogleTvRemoteCardConfig;
  }

  private _emit(config: GoogleTvRemoteCardConfig): void {
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  // ---- render --------------------------------------------------------------

  private _renderGeneral(): TemplateResult {
    const c = this._config!;
    const data = {
      entities: this._deviceEntities,
      name: c.name ?? "",
      show_header: c.show_header !== false,
    };
    const multiple = data.entities.length > 1;
    const schema = [
      { name: "entities", selector: { entity: { multiple: true, filter: { domain: "media_player" } } } },
      ...(multiple ? [] : [{ name: "name", selector: { text: {} } }]),
      { name: "show_header", selector: { boolean: {} } },
    ];
    const labels: Record<string, string> = {
      entities: "TVs and streaming devices (media_player)",
      name: "Name (optional)",
      show_header: "Show name and current app",
    };
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${schema}
        .computeLabel=${(s: { name: string }) => labels[s.name] ?? s.name}
        @value-changed=${(ev: CustomEvent) => {
          const v = ev.detail.value;
          const before = this._deviceEntities;
          const after: string[] = Array.isArray(v.entities) ? v.entities : [];
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            this._setDevices(after);
            return;
          }
          const config = { ...this._config! };
          if (v.name) config.name = v.name;
          else delete config.name;
          if (v.show_header === false) config.show_header = false;
          else delete config.show_header;
          this._emit(config);
        }}
      ></ha-form>
      ${multiple
        ? html`<p class="hint">
            Each device gets a tab on the card. Names and icons for the tabs can be set in the code editor
            (<code>entities: - entity: … name: … icon: …</code>).
          </p>`
        : nothing}
    `;
  }

  private _rowSchema(row: EditorRow) {
    const typeField = {
      name: "type",
      selector: { select: { mode: "dropdown", options: ROW_TYPES } },
    };
    if (row.type === "buttons") {
      return [
        typeField,
        {
          name: "buttons",
          selector: {
            select: {
              multiple: true,
              reorder: true,
              mode: "dropdown",
              options: Object.entries(BUTTONS).map(([value, def]) => ({ value, label: def.name })),
            },
          },
        },
      ];
    }
    if (row.type === "apps") {
      return [
        typeField,
        {
          name: "apps",
          selector: {
            select: {
              multiple: true,
              reorder: true,
              mode: "dropdown",
              options: Object.entries(APPS).map(([value, def]) => ({ value, label: def.name })),
            },
          },
        },
      ];
    }
    return [typeField];
  }

  private _renderRow(row: EditorRow, index: number, count: number): TemplateResult {
    return html`
      <div class="row">
        <div class="row-head">
          <span class="row-title">Row ${index + 1}</span>
          <span class="row-actions">
            <button title="Move up" aria-label="Move up" ?disabled=${index === 0} @click=${() => this._moveRow(index, -1)}>
              <ha-icon icon="mdi:arrow-up"></ha-icon>
            </button>
            <button
              title="Move down"
              aria-label="Move down"
              ?disabled=${index === count - 1}
              @click=${() => this._moveRow(index, 1)}
            >
              <ha-icon icon="mdi:arrow-down"></ha-icon>
            </button>
            <button title="Remove row" aria-label="Remove row" @click=${() => this._removeRow(index)}>
              <ha-icon icon="mdi:delete-outline"></ha-icon>
            </button>
          </span>
        </div>
        ${row.type === "custom"
          ? html`<p class="hint">
              This row has custom buttons or apps. Edit it in the code editor:
              <code>${JSON.stringify(row.raw)}</code>
            </p>`
          : html`<ha-form
              .hass=${this.hass}
              .data=${row}
              .schema=${this._rowSchema(row)}
              .computeLabel=${(s: { name: string }) =>
                ({ type: "Row type", buttons: "Buttons (in order)", apps: "Apps (in order)" })[s.name] ?? s.name}
              @value-changed=${(ev: CustomEvent) => {
                const v = ev.detail.value;
                if (v.type !== row.type) {
                  this._updateRow(index, defaultRowOfType(v.type));
                } else if (row.type === "buttons") {
                  this._updateRow(index, { type: "buttons", buttons: v.buttons ?? [] });
                } else if (row.type === "apps") {
                  this._updateRow(index, { type: "apps", apps: v.apps ?? [] });
                }
              }}
            ></ha-form>`}
      </div>
    `;
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;
    if (!this._ready) return html`<p class="hint">Loading editor…</p>`;
    const rows = this._rows;
    return html`
      <div class="section">${this._renderGeneral()}</div>
      <div class="section">
        <div class="section-title">Layout</div>
        ${rows.map((row, i) => this._renderRow(row, i, rows.length))}
        <button class="add" @click=${this._addRow}><ha-icon icon="mdi:plus"></ha-icon> Add row</button>
        ${this._config.rows
          ? html`<button class="reset" @click=${() => {
              const config = { ...this._config! };
              delete config.rows;
              this._emit(config);
            }}>Reset to default layout</button>`
          : nothing}
      </div>
    `;
  }

  static styles = css`
    .section {
      margin-bottom: 24px;
    }
    .section-title {
      font-weight: 500;
      font-size: 1.1em;
      margin-bottom: 8px;
    }
    .row {
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
      border-radius: 12px;
      padding: 8px 12px 12px;
      margin-bottom: 12px;
    }
    .row-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .row-title {
      font-weight: 500;
      color: var(--secondary-text-color);
    }
    .row-actions {
      display: flex;
      gap: 2px;
    }
    .row-actions button,
    .add,
    .reset {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: none;
      background: none;
      color: var(--primary-text-color);
      cursor: pointer;
      border-radius: 50%;
      padding: 6px;
      font: inherit;
    }
    .row-actions button:hover:not([disabled]) {
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.15));
    }
    .row-actions button[disabled] {
      opacity: 0.3;
      cursor: default;
    }
    .add {
      border-radius: 8px;
      padding: 8px 12px;
      color: var(--primary-color);
      font-weight: 500;
    }
    .reset {
      border-radius: 8px;
      padding: 8px 12px;
      color: var(--secondary-text-color);
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: 0.9em;
      margin: 8px 0;
    }
    code {
      font-size: 0.85em;
      word-break: break-all;
    }
  `;
}

if (!customElements.get("google-tv-remote-card-editor")) {
  customElements.define("google-tv-remote-card-editor", GoogleTvRemoteCardEditor);
}
