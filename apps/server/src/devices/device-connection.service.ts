import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  ClientType,
  DeviceOnlinePayload,
  DeviceRegisterPayload,
  ServerPersistenceMode
} from "@personal-ai-assistant/shared";
import { PrismaService } from "../prisma/prisma.service";
import {
  assertObject,
  optionalRecord,
  optionalString,
  parseMetadata,
  requireString,
  stringifyMetadata
} from "../common/payload";

export interface SocketBinding {
  deviceId: string;
  clientType: ClientType;
  desktopId?: string;
  deviceName?: string;
}

@Injectable()
export class DeviceConnectionService {
  private readonly socketBindings = new Map<string, SocketBinding>();
  private readonly serverPersistenceModes = new Map<string, ServerPersistenceMode>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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

    const session =
      this.prisma.isStorageEnabled() && serverPersistence === "persist"
        ? await this.prisma.deviceSession.upsert({
            where: {
              deviceId_clientType: {
                deviceId: payload.deviceId,
                clientType: payload.clientType
              }
            },
            create: {
              deviceId: payload.deviceId,
              clientType: payload.clientType,
              deviceName: payload.deviceName,
              socketId,
              status: "online",
              clientVersion: payload.clientVersion,
              metadataJson: stringifyMetadata(metadata),
              registeredAt: now,
              lastSeenAt: now
            },
            update: {
              deviceName: payload.deviceName,
              socketId,
              status: "online",
              clientVersion: payload.clientVersion,
              metadataJson: stringifyMetadata(metadata),
              lastSeenAt: now
            }
          })
        : {
            deviceId: payload.deviceId,
            clientType: payload.clientType,
            deviceName: payload.deviceName,
            clientVersion: payload.clientVersion,
            registeredAt: now,
            lastSeenAt: now
          };

    this.socketBindings.set(socketId, {
      deviceId: payload.deviceId,
      clientType: payload.clientType,
      desktopId,
      deviceName: payload.deviceName
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
        deviceId: session.deviceId,
        clientType: session.clientType as ClientType,
        status: "online",
        deviceName: session.deviceName ?? undefined,
        clientVersion: session.clientVersion ?? undefined,
        connectionId: socketId,
        registeredAt: session.registeredAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
        metadata
      },
      serverTime: now.toISOString()
    };
  }

  async markDisconnected(socketId: string) {
    const binding = this.socketBindings.get(socketId);
    this.socketBindings.delete(socketId);

    if (this.prisma.isStorageEnabled()) {
      await this.prisma.deviceSession.updateMany({
        where: {
          socketId
        },
        data: {
          socketId: null,
          status: "offline",
          lastSeenAt: new Date()
        }
      });
    }

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
        connectionId: socketId
      }));
  }

  async getServerPersistenceMode(
    deviceId: string,
    desktopId?: string
  ): Promise<ServerPersistenceMode> {
    if (!this.prisma.isStorageEnabled()) {
      return "relay_only";
    }

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

    const session = await this.prisma.deviceSession.findUnique({
      where: {
        deviceId_clientType: {
          deviceId,
          clientType: "desktop"
        }
      }
    });
    const mode = this.parseServerPersistenceMode(
      parseMetadata(session?.metadataJson ?? null)?.serverPersistence
    );
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

  private parseServerPersistenceMode(value: unknown): ServerPersistenceMode {
    if (value === undefined || value === null) {
      return "relay_only";
    }

    if (value === "persist" || value === "relay_only") {
      return value;
    }

    throw new BadRequestException("metadata.serverPersistence must be persist or relay_only");
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
