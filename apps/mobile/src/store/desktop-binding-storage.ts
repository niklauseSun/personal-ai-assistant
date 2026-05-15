import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DesktopPairingPayload, MobileBoundDesktop } from "@personal-ai-assistant/shared";
import { isDesktopPairingPayload } from "@personal-ai-assistant/shared";

const STORAGE_KEY = "personal-ai-assistant.mobile-desktop-bindings.v1";

export interface DesktopBindingState {
  bindings: MobileBoundDesktop[];
  lastUsedDesktopId?: string;
}

export async function loadDesktopBindingState(): Promise<DesktopBindingState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      bindings: []
    };
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      bindings: []
    };
  }

  const record = parsed as Record<string, unknown>;
  const bindings = Array.isArray(record.bindings)
    ? record.bindings.filter(isMobileBoundDesktop)
    : [];
  const lastUsedDesktopId =
    typeof record.lastUsedDesktopId === "string" ? record.lastUsedDesktopId : undefined;

  return {
    bindings,
    lastUsedDesktopId
  };
}

export async function saveDesktopBindingState(state: DesktopBindingState) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function parsePairingPayload(rawValue: string): DesktopPairingPayload {
  const parsed = JSON.parse(rawValue) as unknown;
  if (!isDesktopPairingPayload(parsed)) {
    throw new Error("Invalid desktop binding QR code");
  }

  return parsed;
}

export function boundDesktopFromPairingPayload(payload: DesktopPairingPayload): MobileBoundDesktop {
  const now = new Date().toISOString();
  return {
    id: payload.desktopId,
    serverUrl: payload.serverUrl.trim().replace(/\/$/, ""),
    deviceId: payload.deviceToken,
    desktopId: payload.desktopId,
    desktopName: payload.desktopName,
    createdAt: payload.createdAt,
    updatedAt: now,
    lastUsedAt: now
  };
}

export function upsertBoundDesktop(
  current: MobileBoundDesktop[],
  next: MobileBoundDesktop
): MobileBoundDesktop[] {
  const withoutCurrent = current.filter((desktop) => desktop.id !== next.id);
  return [next, ...withoutCurrent].sort((left, right) =>
    (right.lastUsedAt ?? right.updatedAt).localeCompare(left.lastUsedAt ?? left.updatedAt)
  );
}

function isMobileBoundDesktop(value: unknown): value is MobileBoundDesktop {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    isNonEmptyString(record.id) &&
    isNonEmptyString(record.serverUrl) &&
    isNonEmptyString(record.deviceId) &&
    isNonEmptyString(record.desktopId) &&
    isNonEmptyString(record.desktopName) &&
    isNonEmptyString(record.createdAt) &&
    isNonEmptyString(record.updatedAt)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
