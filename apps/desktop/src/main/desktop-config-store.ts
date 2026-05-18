import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  DesktopAppConfig,
  DesktopMobileBinding
} from "@personal-ai-assistant/shared";

const CONFIG_FILE_NAME = "desktop-config.json";
const DEFAULT_SERVER_URL = "http://localhost:3000";

export class DesktopConfigStore {
  constructor(private readonly userDataPath: string) {}

  async load() {
    try {
      const raw = await readFile(this.configPath(), "utf8");
      return normalizeConfig(JSON.parse(raw), this.defaultConfig());
    } catch (error) {
      if (isFileNotFound(error)) {
        const config = this.defaultConfig();
        await this.save(config);
        return config;
      }

      throw error;
    }
  }

  async save(rawConfig: unknown) {
    const config = normalizeConfig(rawConfig, this.defaultConfig());
    await mkdir(this.userDataPath, { recursive: true });
    await writeFile(this.configPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
    return config;
  }

  private configPath() {
    return path.join(this.userDataPath, CONFIG_FILE_NAME);
  }

  private defaultConfig(): DesktopAppConfig {
    const now = new Date().toISOString();
    return {
      serverUrl: process.env.SERVER_WS_URL?.trim() || DEFAULT_SERVER_URL,
      desktopName: process.env.DESKTOP_DEVICE_NAME?.trim() || os.hostname(),
      serverPersistence: "relay_only",
      defaultWorkspacePath: optionalTrimmedString(process.env.CODEX_WORKSPACE_PATH),
      bindings: [
        {
          id: randomUUID(),
          deviceId: createDeviceToken(),
          displayName: "Mobile",
          enabled: true,
          createdAt: now,
          updatedAt: now
        }
      ]
    };
  }
}

export function normalizeConfig(rawConfig: unknown, fallback: DesktopAppConfig): DesktopAppConfig {
  const raw = isRecord(rawConfig) ? rawConfig : {};
  const now = new Date().toISOString();
  const desktopName = optionalTrimmedString(raw.desktopName) || fallback.desktopName;
  const serverUrl = normalizeServerUrl(raw.serverUrl, fallback.serverUrl);
  const defaultWorkspacePath = optionalTrimmedString(raw.defaultWorkspacePath);
  const bindings = normalizeBindings(raw.bindings, fallback.bindings, now);

  return {
    serverUrl,
    desktopName,
    serverPersistence: "relay_only",
    defaultWorkspacePath,
    bindings
  };
}

function normalizeBindings(
  rawBindings: unknown,
  fallbackBindings: DesktopMobileBinding[],
  now: string
) {
  const source = Array.isArray(rawBindings) ? rawBindings : fallbackBindings;
  const seenDeviceIds = new Set<string>();
  const bindings: DesktopMobileBinding[] = [];

  for (const item of source) {
    if (!isRecord(item)) {
      continue;
    }

    const deviceId = optionalTrimmedString(item.deviceId);
    if (!deviceId || seenDeviceIds.has(deviceId)) {
      continue;
    }

    seenDeviceIds.add(deviceId);
    bindings.push({
      id: optionalTrimmedString(item.id) || randomUUID(),
      deviceId,
      displayName: optionalTrimmedString(item.displayName),
      enabled: typeof item.enabled === "boolean" ? item.enabled : true,
      createdAt: optionalTrimmedString(item.createdAt) || now,
      updatedAt: now
    });
  }

  return bindings;
}

function optionalTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeServerUrl(value: unknown, fallback: string) {
  if (typeof value === "string") {
    return value.trim();
  }

  return fallback;
}

function createDeviceToken() {
  return `device-token-${randomUUID()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileNotFound(error: unknown) {
  return isRecord(error) && error.code === "ENOENT";
}
