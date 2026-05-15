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

interface SocketBinding {
  deviceId: string;
  clientType: ClientType;
}

@Injectable()
export class DeviceConnectionService {
  private readonly socketBindings = new Map<string, SocketBinding>();
  private readonly serverPersistenceModes = new Map<string, ServerPersistenceMode>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  static roomName(deviceId: string, clientType: ClientType) {
    return `device:${deviceId}:${clientType}`;
  }

  async register(socketId: string, rawPayload: unknown): Promise<DeviceOnlinePayload> {
    const payload = this.parseRegisterPayload(rawPayload);
    const now = new Date();
    const serverPersistence = this.parseServerPersistenceMode(payload.metadata?.serverPersistence);
    const metadata =
      payload.clientType === "desktop"
        ? {
            ...payload.metadata,
            serverPersistence
          }
        : payload.metadata;

    const session = await this.prisma.deviceSession.upsert({
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
    });

    this.socketBindings.set(socketId, {
      deviceId: payload.deviceId,
      clientType: payload.clientType
    });

    if (payload.clientType === "desktop") {
      this.serverPersistenceModes.set(payload.deviceId, serverPersistence);
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
    this.socketBindings.delete(socketId);

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

  getSocketBinding(socketId: string): SocketBinding | undefined {
    return this.socketBindings.get(socketId);
  }

  async getServerPersistenceMode(deviceId: string): Promise<ServerPersistenceMode> {
    const cached = this.serverPersistenceModes.get(deviceId);
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
    this.serverPersistenceModes.set(deviceId, mode);
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
      return "persist";
    }

    if (value === "persist" || value === "relay_only") {
      return value;
    }

    throw new BadRequestException("metadata.serverPersistence must be persist or relay_only");
  }
}
