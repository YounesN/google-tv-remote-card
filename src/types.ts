// Minimal subset of Home Assistant frontend types used by the card.

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown>;
}

export interface TclRemoteCardConfig {
  type: string;
  entity: string;
  remote_entity?: string;
  name?: string;
}
