import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { PrismaService } from "../prisma/prisma.service";
import { DeviceConnectionService } from "./device-connection.service";

describe("DeviceConnectionService", () => {
  const prisma = new PrismaService();
  const service = new DeviceConnectionService(prisma);

  before(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.deviceSession.deleteMany();
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("registers desktop and mobile sessions by shared deviceId", async () => {
    const desktop = await service.register("socket-desktop", {
      deviceId: "binding-1",
      deviceName: "MacBook",
      clientType: "desktop"
    });

    const mobile = await service.register("socket-mobile", {
      deviceId: "binding-1",
      clientType: "mobile"
    });

    assert.equal(desktop.session.deviceId, "binding-1");
    assert.equal(desktop.session.clientType, "desktop");
    assert.equal(desktop.session.deviceName, "MacBook");
    assert.equal(mobile.session.clientType, "mobile");
    assert.deepEqual(service.getSocketBinding("socket-desktop"), {
      deviceId: "binding-1",
      clientType: "desktop"
    });
    assert.equal(await service.getServerPersistenceMode("binding-1"), "persist");
  });

  it("tracks relay-only server persistence mode from desktop metadata", async () => {
    const desktop = await service.register("socket-desktop", {
      deviceId: "binding-relay",
      deviceName: "MacBook",
      clientType: "desktop",
      metadata: {
        serverPersistence: "relay_only"
      }
    });

    assert.equal(desktop.session.metadata?.serverPersistence, "relay_only");
    assert.equal(await service.getServerPersistenceMode("binding-relay"), "relay_only");
  });

  it("marks a disconnected socket offline", async () => {
    await service.register("socket-desktop", {
      deviceId: "binding-2",
      clientType: "desktop"
    });

    await service.markDisconnected("socket-desktop");

    const session = await prisma.deviceSession.findUnique({
      where: {
        deviceId_clientType: {
          deviceId: "binding-2",
          clientType: "desktop"
        }
      }
    });

    assert.equal(session?.status, "offline");
    assert.equal(session?.socketId, null);
    assert.equal(service.getSocketBinding("socket-desktop"), undefined);
  });
});
