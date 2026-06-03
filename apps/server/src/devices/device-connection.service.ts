import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  ClientType,
  DeviceHeartbeatPayload,
  DeviceOnlinePayload,
  DeviceRegisterPayload,
  ServerPersistenceMode
} from "@personal-ai-assistant/shared";
import {
  assertObject,
  optionalRecord,
  optionalString,
  requireString
} from "../common/payload";

export interface SocketBinding {
  deviceId: string;
  clientType: ClientType;
  desktopId?: string;
  deviceName?: string;
  clientVersion?: string;
  registeredAt: string;
  lastSeenAt: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class DeviceConnectionService {
  private readonly socketBindings = new Map<string, SocketBinding>();
  private readonly serverPersistenceModes = new Map<string, ServerPersistenceMode>();

  static roomName(deviceId: string, clientType: ClientType) {
    return `device:${deviceId}:${clientType}`;
  }

  static desktopTargetRoomName(deviceId: string, desktopId: string) {
    return `device:${deviceId}:desktop:${desktopId}`;
  }

  async register(socketId: string, rawPayload: unknown): Promise<DeviceOnlinePayload> {
    const payload = this.parseRegisterPayload(rawPayload);
    const now = new Date();
    const serverPersistence = this.parseServerPersistenceMode(payload.metadata?.serverPersistence);
    const desktopId =
      payload.clientType === "desktop"
        ? this.optionalDesktopId(payload.metadata?.desktopId) ?? payload.deviceId
        : undefined;
    const metadata =
      payload.clientType === "desktop"
        ? {
            ...payload.metadata,
            desktopId,
            serverPersistence
          }
        : payload.metadata;

    const registeredAt = now.toISOString();
    const lastSeenAt = registeredAt;

    this.socketBindings.set(socketId, {
      deviceId: payload.deviceId,
      clientType: payload.clientType,
      desktopId,
      deviceName: payload.deviceName,
      clientVersion: payload.clientVersion,
      registeredAt,
      lastSeenAt,
      metadata
    });

    if (payload.clientType === "desktop") {
      this.serverPersistenceModes.set(this.persistenceKey(payload.deviceId), serverPersistence);
      if (desktopId) {
        this.serverPersistenceModes.set(
          this.persistenceKey(payload.deviceId, desktopId),
          serverPersistence
        );
      }
    }

    return {
      session: {
        deviceId: payload.deviceId,
        clientType: payload.clientType,
        status: "online",
        deviceName: payload.deviceName,
        clientVersion: payload.clientVersion,
        connectionId: socketId,
        registeredAt,
        lastSeenAt,
        metadata
      },
      serverTime: now.toISOString()
    };
  }

  async heartbeat(socketId: string, rawPayload: unknown): Promise<DeviceOnlinePayload> {
    const binding = this.requireSocketBinding(socketId, "desktop");
    const payload = this.parseHeartbeatPayload(rawPayload);
    if (payload.deviceId !== binding.deviceId) {
      throw new BadRequestException("device.heartbeat deviceId must match registered device");
    }

    if (payload.clientType && payload.clientType !== "desktop") {
      throw new BadRequestException("device.heartbeat requires a desktop client");
    }

    if (payload.desktopId && payload.desktopId !== binding.desktopId) {
      throw new BadRequestException("device.heartbeat desktopId must match registered desktop");
    }

    const now = new Date();
    const lastSeenAt = now.toISOString();
    binding.lastSeenAt = lastSeenAt;

    return {
      session: this.toDeviceSession(binding, socketId, "online"),
      serverTime: lastSeenAt
    };
  }

  async markDisconnected(socketId: string) {
    const binding = this.socketBindings.get(socketId);
    const disconnectedAt = new Date();
    if (binding) {
      binding.lastSeenAt = disconnectedAt.toISOString();
    }
    this.socketBindings.delete(socketId);

    return binding;
  }

  getSocketBinding(socketId: string): SocketBinding | undefined {
    return this.socketBindings.get(socketId);
  }

  listDesktopBindings(deviceId: string) {
    return Array.from(this.socketBindings.entries())
      .filter(([, binding]) => binding.deviceId === deviceId && binding.clientType === "desktop")
      .map(([socketId, binding]) => ({
        deviceId: binding.deviceId,
        clientType: binding.clientType,
        desktopId: binding.desktopId,
        deviceName: binding.deviceName,
        clientVersion: binding.clientVersion,
        connectionId: socketId,
        registeredAt: binding.registeredAt,
        lastSeenAt: binding.lastSeenAt,
        metadata: binding.metadata
      }));
  }

  async getServerPersistenceMode(
    deviceId: string,
    desktopId?: string
  ): Promise<ServerPersistenceMode> {
    const targetCached = desktopId
      ? this.serverPersistenceModes.get(this.persistenceKey(deviceId, desktopId))
      : undefined;
    if (targetCached) {
      return targetCached;
    }

    const cached = this.serverPersistenceModes.get(this.persistenceKey(deviceId));
    if (cached) {
      return cached;
    }

    const mode = "relay_only";
    this.serverPersistenceModes.set(this.persistenceKey(deviceId), mode);
    return mode;
  }

  requireSocketBinding(socketId: string, expectedClientType?: ClientType): SocketBinding {
    const binding = this.socketBindings.get(socketId);
    if (!binding) {
      throw new BadRequestException("device.register is required before task events");
    }

    if (expectedClientType && binding.clientType !== expectedClientType) {
      throw new BadRequestException(`event requires a ${expectedClientType} client`);
    }

    return binding;
  }

  private parseRegisterPayload(rawPayload: unknown): DeviceRegisterPayload {
    assertObject(rawPayload, "device.register payload");

    const clientType = requireString(rawPayload.clientType, "clientType");
    if (clientType !== "desktop" && clientType !== "mobile") {
      throw new BadRequestException("clientType must be desktop or mobile");
    }

    return {
      deviceId: requireString(rawPayload.deviceId, "deviceId"),
      clientType,
      deviceName: optionalString(rawPayload.deviceName, "deviceName"),
      clientVersion: optionalString(rawPayload.clientVersion, "clientVersion"),
      metadata: optionalRecord(rawPayload.metadata, "metadata")
    };
  }

  private parseHeartbeatPayload(rawPayload: unknown): DeviceHeartbeatPayload {
    assertObject(rawPayload, "device.heartbeat payload");

    const clientType = optionalString(rawPayload.clientType, "clientType");
    if (clientType !== undefined && clientType !== "desktop" && clientType !== "mobile") {
      throw new BadRequestException("clientType must be desktop or mobile");
    }

    return {
      deviceId: requireString(rawPayload.deviceId, "deviceId"),
      clientType,
      desktopId: optionalString(rawPayload.desktopId, "desktopId"),
      sentAt: optionalString(rawPayload.sentAt, "sentAt"),
      metadata: optionalRecord(rawPayload.metadata, "metadata")
    };
  }

  private toDeviceSession(
    binding: SocketBinding,
    socketId: string,
    status: "online" | "offline"
  ) {
    return {
      deviceId: binding.deviceId,
      clientType: binding.clientType,
      status,
      deviceName: binding.deviceName,
      clientVersion: binding.clientVersion,
      connectionId: socketId,
      registeredAt: binding.registeredAt,
      lastSeenAt: binding.lastSeenAt,
      metadata: binding.metadata
    };
  }

  private parseServerPersistenceMode(value: unknown): ServerPersistenceMode {
    if (value === undefined || value === null) {
      return "relay_only";
    }

    if (value === "relay_only") {
      return "relay_only";
    }

    if (value === "persist") {
      return "relay_only";
    }

    throw new BadRequestException("metadata.serverPersistence must be relay_only");
  }

  private optionalDesktopId(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw new BadRequestException("metadata.desktopId must be a string");
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private persistenceKey(deviceId: string, desktopId?: string) {
    return desktopId ? `${deviceId}:${desktopId}` : deviceId;
  }
}
