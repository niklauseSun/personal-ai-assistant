import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  ClientType,
  DeviceOnlinePayload,
  DeviceRegisterPayload
} from "@personal-ai-assistant/shared";
import { PrismaService } from "../prisma/prisma.service";
import {
  assertObject,
  optionalRecord,
  optionalString,
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

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  static roomName(deviceId: string, clientType: ClientType) {
    return `device:${deviceId}:${clientType}`;
  }

  async register(socketId: string, rawPayload: unknown): Promise<DeviceOnlinePayload> {
    const payload = this.parseRegisterPayload(rawPayload);
    const now = new Date();

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
        metadataJson: stringifyMetadata(payload.metadata),
        registeredAt: now,
        lastSeenAt: now
      },
      update: {
        deviceName: payload.deviceName,
        socketId,
        status: "online",
        clientVersion: payload.clientVersion,
        metadataJson: stringifyMetadata(payload.metadata),
        lastSeenAt: now
      }
    });

    this.socketBindings.set(socketId, {
      deviceId: payload.deviceId,
      clientType: payload.clientType
    });

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
        metadata: payload.metadata
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
}
