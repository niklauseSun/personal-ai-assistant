import type { MobileDeviceInfo } from "./models";

export type ServerPersistenceMode = "persist" | "relay_only";

export const DESKTOP_PAIRING_PAYLOAD_TYPE = "personal-ai-assistant.desktop-binding" as const;
export const DESKTOP_PAIRING_PAYLOAD_VERSION = 1 as const;

export interface DesktopMobileBinding {
  id: string;
  deviceId: string;
  displayName?: string;
  mobileDevice?: MobileDeviceInfo;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DesktopAppConfig {
  serverUrl: string;
  desktopName: string;
  serverPersistence: ServerPersistenceMode;
  defaultWorkspacePath?: string;
  bindings: DesktopMobileBinding[];
}

export interface DesktopPairingPayload {
  type: typeof DESKTOP_PAIRING_PAYLOAD_TYPE;
  version: typeof DESKTOP_PAIRING_PAYLOAD_VERSION;
  serverUrl: string;
  deviceToken: string;
  desktopId: string;
  desktopName: string;
  createdAt: string;
}

export interface MobileBoundDesktop {
  id: string;
  serverUrl: string;
  bindingToken: string;
  desktopId: string;
  desktopName: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export function createDesktopPairingPayload(input: {
  serverUrl: string;
  deviceToken: string;
  desktopId: string;
  desktopName: string;
  createdAt?: string;
}): DesktopPairingPayload {
  return {
    type: DESKTOP_PAIRING_PAYLOAD_TYPE,
    version: DESKTOP_PAIRING_PAYLOAD_VERSION,
    serverUrl: input.serverUrl,
    deviceToken: input.deviceToken,
    desktopId: input.desktopId,
    desktopName: input.desktopName,
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

export function isDesktopPairingPayload(value: unknown): value is DesktopPairingPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    payload.type === DESKTOP_PAIRING_PAYLOAD_TYPE &&
    payload.version === DESKTOP_PAIRING_PAYLOAD_VERSION &&
    isNonEmptyString(payload.serverUrl) &&
    isNonEmptyString(payload.deviceToken) &&
    isNonEmptyString(payload.desktopId) &&
    isNonEmptyString(payload.desktopName) &&
    isNonEmptyString(payload.createdAt)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
