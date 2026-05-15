import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { PrismaService } from "../prisma/prisma.service";
import { DeviceConnectionService } from "./device-connection.service";

process.env.SERVER_STORAGE_MODE = "persist";

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
    assert.equal(desktop.session.metadata?.desktopId, "binding-1");
    assert.equal(mobile.session.clientType, "mobile");
    const desktopBinding = service.getSocketBinding("socket-desktop");
    assert.equal(desktopBinding?.deviceId, "binding-1");
    assert.equal(desktopBinding?.clientType, "desktop");
    assert.equal(desktopBinding?.desktopId, "binding-1");
    assert.equal(await service.getServerPersistenceMode("binding-1"), "relay_only");
  });

  it("tracks multiple online desktop bindings for one mobile deviceId", async () => {
    await service.register("socket-desktop-a", {
      deviceId: "shared-mobile",
      deviceName: "Mac Studio",
      clientType: "desktop",
      metadata: {
        desktopId: "desktop-a"
      }
    });
    await service.register("socket-desktop-b", {
      deviceId: "shared-mobile",
      deviceName: "ThinkPad",
      clientType: "desktop",
      metadata: {
        desktopId: "desktop-b",
        serverPersistence: "relay_only"
      }
    });

    const desktops = service.listDesktopBindings("shared-mobile");
    assert.deepEqual(
      desktops.map((desktop) => desktop.desktopId).sort(),
      ["desktop-a", "desktop-b"]
    );
    assert.equal(
      await service.getServerPersistenceMode("shared-mobile", "desktop-a"),
      "relay_only"
    );
    assert.equal(
      await service.getServerPersistenceMode("shared-mobile", "desktop-b"),
      "relay_only"
    );
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
      clientType: "desktop",
      metadata: {
        serverPersistence: "persist"
      }
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
