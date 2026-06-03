import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DeviceConnectionService } from "./device-connection.service";

describe("DeviceConnectionService", () => {
  it("registers desktop and mobile sessions by shared deviceId", async () => {
    const service = new DeviceConnectionService();

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
    assert.equal(desktop.session.metadata?.serverPersistence, "relay_only");
    assert.equal(mobile.session.clientType, "mobile");
    const desktopBinding = service.getSocketBinding("socket-desktop");
    assert.equal(desktopBinding?.deviceId, "binding-1");
    assert.equal(desktopBinding?.clientType, "desktop");
    assert.equal(desktopBinding?.desktopId, "binding-1");
    assert.equal(await service.getServerPersistenceMode("binding-1"), "relay_only");
  });

  it("tracks multiple online desktop bindings for one mobile deviceId", async () => {
    const service = new DeviceConnectionService();

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

  it("downgrades legacy persist metadata to relay-only mode", async () => {
    const service = new DeviceConnectionService();
    const desktop = await service.register("socket-desktop", {
      deviceId: "binding-relay",
      deviceName: "MacBook",
      clientType: "desktop",
      metadata: {
        serverPersistence: "persist"
      }
    });

    assert.equal(desktop.session.metadata?.serverPersistence, "relay_only");
    assert.equal(await service.getServerPersistenceMode("binding-relay"), "relay_only");
  });

  it("updates desktop lastSeenAt from heartbeat", async () => {
    const service = new DeviceConnectionService();
    const registered = await service.register("socket-heartbeat", {
      deviceId: "binding-heartbeat",
      deviceName: "Mac mini",
      clientType: "desktop",
      metadata: {
        desktopId: "desktop-heartbeat"
      }
    });

    const heartbeat = await service.heartbeat("socket-heartbeat", {
      deviceId: "binding-heartbeat",
      clientType: "desktop",
      desktopId: "desktop-heartbeat",
      sentAt: "2026-05-15T00:00:00.000Z"
    });

    assert.equal(heartbeat.session.status, "online");
    assert.equal(heartbeat.session.metadata?.desktopId, "desktop-heartbeat");
    assert.ok(
      Date.parse(heartbeat.session.lastSeenAt) >= Date.parse(registered.session.lastSeenAt)
    );
  });

  it("marks a disconnected socket offline in memory", async () => {
    const service = new DeviceConnectionService();
    await service.register("socket-desktop", {
      deviceId: "binding-2",
      clientType: "desktop"
    });

    const disconnected = await service.markDisconnected("socket-desktop");

    assert.equal(disconnected?.deviceId, "binding-2");
    assert.equal(service.getSocketBinding("socket-desktop"), undefined);
  });
});
