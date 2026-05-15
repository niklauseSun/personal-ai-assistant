import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { WS_EVENTS } from "@personal-ai-assistant/shared";
import type { Server, Socket } from "socket.io";
import { DeviceConnectionService } from "../devices/device-connection.service";
import { PrismaService } from "../prisma/prisma.service";
import { TaskService } from "../tasks/task.service";
import { AgentGateway } from "./agent.gateway";

process.env.SERVER_STORAGE_MODE = "relay_only";

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
  const prisma = new PrismaService();
  const deviceConnectionService = new DeviceConnectionService(prisma);
  const taskService = new TaskService(prisma);
  let gateway: AgentGateway;
  let server: FakeServer;

  before(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    process.env.RELAY_RETRY_ATTEMPTS = "5";
    process.env.RELAY_RETRY_DELAY_MS = "0";
    await prisma.taskEvent.deleteMany();
    await prisma.approvalResult.deleteMany();
    await prisma.approvalRequest.deleteMany();
    await prisma.outputChunk.deleteMany();
    await prisma.agentTask.deleteMany();
    await prisma.deviceSession.deleteMany();

    gateway = new AgentGateway(deviceConnectionService, taskService);
    server = new FakeServer();
    Object.assign(gateway, { server: server as unknown as Server });
  });

  after(async () => {
    await prisma.$disconnect();
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
    assert.equal(await prisma.agentTask.count(), 0);
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

    assert.equal(await prisma.outputChunk.count(), 0);
    assert.equal(await prisma.approvalResult.count(), 0);
    assert.equal(await prisma.taskEvent.count(), 0);
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
    assert.equal(await prisma.agentTask.count(), 0);
  });
});
