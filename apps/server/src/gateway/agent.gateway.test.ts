import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { WS_EVENTS } from "@personal-ai-assistant/shared";
import type { Server, Socket } from "socket.io";
import { DeviceConnectionService } from "../devices/device-connection.service";
import { TaskService } from "../tasks/task.service";
import { AgentGateway } from "./agent.gateway";

class FakeSocket {
  readonly joins: string[] = [];
  readonly emissions: Array<{ eventName: string; payload: unknown }> = [];

  constructor(readonly id: string) {}

  async join(room: string) {
    this.joins.push(room);
  }

  emit(eventName: string, payload: unknown) {
    this.emissions.push({ eventName, payload });
  }
}

class FakeServer {
  readonly emissions: Array<{ room: string; eventName: string; payload: unknown }> = [];

  to(room: string) {
    return {
      emit: (eventName: string, payload: unknown) => {
        this.emissions.push({ room, eventName, payload });
      }
    };
  }
}

describe("AgentGateway relay-only mode", () => {
  const deviceConnectionService = new DeviceConnectionService();
  const taskService = new TaskService();
  let gateway: AgentGateway;
  let server: FakeServer;

  beforeEach(() => {
    process.env.RELAY_RETRY_ATTEMPTS = "5";
    process.env.RELAY_RETRY_DELAY_MS = "0";

    gateway = new AgentGateway(deviceConnectionService, taskService);
    server = new FakeServer();
    Object.assign(gateway, { server: server as unknown as Server });
  });

  it("relays task events without storing task history", async () => {
    const desktop = new FakeSocket("desktop-socket");
    const mobile = new FakeSocket("mobile-socket");

    await gateway.handleDeviceRegister(
      {
        deviceId: "binding-relay",
        deviceName: "Workstation",
        clientType: "desktop",
        metadata: {
          desktopId: "desktop-relay",
          serverPersistence: "relay_only"
        }
      },
      desktop as unknown as Socket
    );
    await gateway.handleDeviceRegister(
      {
        deviceId: "binding-relay",
        clientType: "mobile"
      },
      mobile as unknown as Socket
    );

    const created = await gateway.handleTaskCreate(
      {
        deviceId: "binding-relay",
        targetDesktopId: "desktop-relay",
        requestId: "task-relay",
        prompt: "Run Codex without server history",
        metadata: {
          workspacePath: "/tmp/project"
        }
      },
      mobile as unknown as Socket
    );

    assert.equal(created.task.id, "task-relay");
    assert.equal(created.task.assignedDesktopDeviceId, "desktop-relay");
    assert.ok(
      desktop.joins.includes(
        DeviceConnectionService.desktopTargetRoomName("binding-relay", "desktop-relay")
      )
    );
    assert.ok(
      server.emissions.some(
        (emission) =>
          emission.room ===
            DeviceConnectionService.desktopTargetRoomName("binding-relay", "desktop-relay") &&
          emission.eventName === WS_EVENTS.TASK_CREATED
      )
    );

    await gateway.handleTaskOutput(
      {
        taskId: "task-relay",
        chunk: {
          id: "chunk-relay",
          taskId: "task-relay",
          sequence: 1,
          stream: "stdout",
          content: "hello",
          createdAt: "2026-05-15T00:00:00.000Z"
        }
      },
      desktop as unknown as Socket
    );

    await gateway.handleTaskApprovalSubmit(
      {
        taskId: "task-relay",
        approvalRequestId: "approval-relay",
        deviceId: "binding-relay",
        targetDesktopId: "desktop-relay",
        decision: "approved"
      },
      mobile as unknown as Socket
    );

    assert.ok(
      server.emissions.some(
        (emission) =>
          emission.room === DeviceConnectionService.roomName("binding-relay", "mobile") &&
          emission.eventName === WS_EVENTS.TASK_OUTPUT
      )
    );
    assert.ok(
      server.emissions.some(
        (emission) =>
          emission.room ===
            DeviceConnectionService.desktopTargetRoomName("binding-relay", "desktop-relay") &&
          emission.eventName === WS_EVENTS.TASK_APPROVAL_SUBMIT
      )
    );
    assert.ok(
      server.emissions.some(
        (emission) =>
          emission.room === DeviceConnectionService.roomName("binding-relay", "mobile") &&
          emission.eventName === WS_EVENTS.TASK_APPROVAL_RESULT
      )
    );
  });

  it("reports relay failures to mobile after retrying five times", async () => {
    const mobile = new FakeSocket("mobile-offline-target");

    await gateway.handleDeviceRegister(
      {
        deviceId: "binding-offline",
        clientType: "mobile"
      },
      mobile as unknown as Socket
    );

    await gateway.handleTaskCreate(
      {
        deviceId: "binding-offline",
        targetDesktopId: "desktop-missing",
        requestId: "task-offline",
        prompt: "Run on a missing desktop",
        metadata: {
          workspacePath: "/tmp/project"
        }
      },
      mobile as unknown as Socket
    );

    const relayFailure = server.emissions.find(
      (emission) =>
        emission.room === DeviceConnectionService.roomName("binding-offline", "mobile") &&
        emission.eventName === WS_EVENTS.TASK_RELAY_FAILED
    );

    assert.ok(relayFailure);
    assert.equal((relayFailure.payload as { attempts: number }).attempts, 5);
    assert.equal(
      (relayFailure.payload as { error: { code: string } }).error.code,
      "RELAY_TARGET_OFFLINE"
    );
  });

  it("relays desktop heartbeat as an online update to mobile clients", async () => {
    const desktop = new FakeSocket("desktop-heartbeat-socket");
    const mobile = new FakeSocket("mobile-heartbeat-socket");

    await gateway.handleDeviceRegister(
      {
        deviceId: "binding-heartbeat",
        deviceName: "MacBook",
        clientType: "desktop",
        metadata: {
          desktopId: "desktop-heartbeat",
          serverPersistence: "relay_only"
        }
      },
      desktop as unknown as Socket
    );
    await gateway.handleDeviceRegister(
      {
        deviceId: "binding-heartbeat",
        clientType: "mobile"
      },
      mobile as unknown as Socket
    );

    const response = await gateway.handleDeviceHeartbeat(
      {
        deviceId: "binding-heartbeat",
        clientType: "desktop",
        desktopId: "desktop-heartbeat"
      },
      desktop as unknown as Socket
    );

    assert.equal(response.session.status, "online");
    assert.equal(response.session.metadata?.desktopId, "desktop-heartbeat");
    assert.ok(
      server.emissions.some(
        (emission) =>
          emission.room === DeviceConnectionService.roomName("binding-heartbeat", "mobile") &&
          emission.eventName === WS_EVENTS.DEVICE_ONLINE &&
          (emission.payload as { session: { status: string } }).session.status === "online"
      )
    );
  });

  it("relays desktop binding confirmations only when the pending desktop is online", async () => {
    const desktop = new FakeSocket("desktop-pairing-socket");
    const mobile = new FakeSocket("mobile-pairing-socket");

    await gateway.handleDeviceRegister(
      {
        deviceId: "binding-pairing",
        deviceName: "MacBook / Mobile",
        clientType: "desktop",
        metadata: {
          desktopId: "desktop-pairing",
          serverPersistence: "relay_only",
          pendingPairing: true
        }
      },
      desktop as unknown as Socket
    );
    await gateway.handleDeviceRegister(
      {
        deviceId: "binding-pairing",
        clientType: "mobile"
      },
      mobile as unknown as Socket
    );

    const confirmed = await gateway.handleDesktopBindingConfirm(
      {
        deviceId: "binding-pairing",
        desktopId: "desktop-pairing",
        desktopName: "MacBook",
        pairingCode: "123456",
        mobileDevice: {
          deviceName: "Alice's iPhone",
          modelName: "iPhone 15 Pro",
          osName: "ios",
          osVersion: "17.5",
          platform: "ios"
        },
        confirmedAt: "2026-05-18T00:00:00.000Z"
      },
      mobile as unknown as Socket
    );

    assert.equal(confirmed.desktopId, "desktop-pairing");
    assert.ok(
      server.emissions.some(
        (emission) =>
          emission.room ===
            DeviceConnectionService.desktopTargetRoomName("binding-pairing", "desktop-pairing") &&
          emission.eventName === WS_EVENTS.DESKTOP_BINDING_CONFIRM
      )
    );
    assert.ok(
      !server.emissions.some(
        (emission) =>
          emission.room === DeviceConnectionService.roomName("binding-pairing", "mobile") &&
          emission.eventName === WS_EVENTS.DESKTOP_BINDING_CONFIRMED
      )
    );

    await gateway.handleDesktopBindingConfirmed(
      {
        deviceId: "binding-pairing",
        desktopId: "desktop-pairing",
        desktopName: "MacBook",
        pairingCode: "123456",
        mobileDevice: {
          deviceName: "Alice's iPhone",
          modelName: "iPhone 15 Pro",
          osName: "ios",
          osVersion: "17.5",
          platform: "ios"
        },
        confirmedAt: "2026-05-18T00:00:00.000Z"
      },
      desktop as unknown as Socket
    );
    assert.ok(
      server.emissions.some(
        (emission) =>
          emission.room === DeviceConnectionService.roomName("binding-pairing", "mobile") &&
          emission.eventName === WS_EVENTS.DESKTOP_BINDING_CONFIRMED
      )
    );
  });

  it("reports binding confirmation failures when the pairing modal has closed", async () => {
    const mobile = new FakeSocket("mobile-missing-pairing-target");

    await gateway.handleDeviceRegister(
      {
        deviceId: "binding-pairing-missing",
        clientType: "mobile"
      },
      mobile as unknown as Socket
    );

    await gateway.handleDesktopBindingConfirm(
      {
        deviceId: "binding-pairing-missing",
        desktopId: "desktop-missing",
        desktopName: "MacBook",
        pairingCode: "123456",
        mobileDevice: {
          deviceName: "Alice's iPhone",
          modelName: "iPhone 15 Pro",
          platform: "ios"
        },
        confirmedAt: "2026-05-18T00:00:00.000Z"
      },
      mobile as unknown as Socket
    );

    assert.ok(
      server.emissions.some(
        (emission) =>
          emission.room === DeviceConnectionService.roomName("binding-pairing-missing", "mobile") &&
          emission.eventName === WS_EVENTS.TASK_RELAY_FAILED &&
          (emission.payload as { failedEventName: string }).failedEventName ===
            WS_EVENTS.DESKTOP_BINDING_CONFIRM
      )
    );
    assert.ok(
      !server.emissions.some(
        (emission) =>
          emission.room === DeviceConnectionService.roomName("binding-pairing-missing", "mobile") &&
          emission.eventName === WS_EVENTS.DESKTOP_BINDING_CONFIRMED
      )
    );
  });

  it("relays desktop binding failures from desktop back to mobile", async () => {
    const desktop = new FakeSocket("desktop-failed-pairing-socket");
    const mobile = new FakeSocket("mobile-failed-pairing-socket");

    await gateway.handleDeviceRegister(
      {
        deviceId: "binding-pairing-failed",
        deviceName: "MacBook / Mobile",
        clientType: "desktop",
        metadata: {
          desktopId: "desktop-pairing-failed",
          serverPersistence: "relay_only",
          pendingPairing: true
        }
      },
      desktop as unknown as Socket
    );
    await gateway.handleDeviceRegister(
      {
        deviceId: "binding-pairing-failed",
        clientType: "mobile"
      },
      mobile as unknown as Socket
    );

    const failed = await gateway.handleDesktopBindingFailed(
      {
        deviceId: "binding-pairing-failed",
        desktopId: "desktop-pairing-failed",
        reason: "Invalid pairing code",
        rejectedAt: "2026-05-18T00:00:00.000Z"
      },
      desktop as unknown as Socket
    );

    assert.equal(failed.reason, "Invalid pairing code");
    assert.ok(
      server.emissions.some(
        (emission) =>
          emission.room === DeviceConnectionService.roomName("binding-pairing-failed", "mobile") &&
          emission.eventName === WS_EVENTS.DESKTOP_BINDING_FAILED
      )
    );
  });
});
