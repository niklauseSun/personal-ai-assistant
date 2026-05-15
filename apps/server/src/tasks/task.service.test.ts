import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { WS_EVENTS } from "@personal-ai-assistant/shared";
import { PrismaService } from "../prisma/prisma.service";
import { TaskService } from "./task.service";

process.env.SERVER_STORAGE_MODE = "persist";

describe("TaskService", () => {
  const prisma = new PrismaService();
  const service = new TaskService(prisma);

  before(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.taskEvent.deleteMany();
    await prisma.approvalResult.deleteMany();
    await prisma.approvalRequest.deleteMany();
    await prisma.outputChunk.deleteMany();
    await prisma.agentTask.deleteMany();
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("creates a task and stores the created event", async () => {
    const created = await service.createTask(
      {
        deviceId: "binding-1",
        targetDesktopId: "desktop-1",
        prompt: "Implement server"
      },
      "socket-mobile"
    );

    assert.equal(created.task.status, "created");
    assert.equal(created.task.createdByDeviceId, "binding-1");
    assert.equal(created.task.assignedDesktopDeviceId, "desktop-1");
    assert.equal(await service.getTaskTargetDesktopId(created.task.id), "desktop-1");

    const tasks = await service.listTasks("binding-1");
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].id, created.task.id);

    const history = await service.getTask(created.task.id);
    assert.deepEqual(
      history.events.map((event) => event.eventName),
      [WS_EVENTS.TASK_CREATED]
    );
  });

  it("creates transient relay-only task payloads without storing history", async () => {
    const created = service.createTransientTask({
      deviceId: "binding-relay",
      targetDesktopId: "desktop-relay",
      prompt: "Run without server history",
      requestId: "task-relay",
      metadata: {
        workspacePath: "/tmp/project"
      }
    });
    const approval = service.toRelayApproval({
      taskId: "task-relay",
      approvalRequestId: "approval-relay",
      deviceId: "binding-relay",
      targetDesktopId: "desktop-relay",
      decision: "approved"
    });

    assert.equal(created.task.id, "task-relay");
    assert.equal(created.task.status, "created");
    assert.equal(created.task.assignedDesktopDeviceId, "desktop-relay");
    assert.equal(created.task.metadata?.workspacePath, "/tmp/project");
    assert.equal(approval.submitPayload.targetDesktopId, "desktop-relay");
    assert.equal(approval.resultPayload.status, "approved");
    assert.equal(await prisma.agentTask.count(), 0);
    assert.equal(await prisma.taskEvent.count(), 0);
    assert.equal(await prisma.approvalResult.count(), 0);
  });

  it("stores output, approval, completion, and history events", async () => {
    const created = await service.createTask({
      deviceId: "binding-2",
      prompt: "Run Codex"
    });

    await service.markStarted({
      task: {
        id: created.task.id
      },
      startedAt: "2026-05-13T00:00:00.000Z"
    });

    await service.appendOutput({
      taskId: created.task.id,
      chunk: {
        id: "chunk-1",
        taskId: created.task.id,
        sequence: 1,
        stream: "stdout",
        content: "hello",
        createdAt: "2026-05-13T00:00:01.000Z"
      }
    });

    await service.markWaitingApproval({
      task: {
        id: created.task.id
      },
      approval: {
        id: "approval-1",
        taskId: created.task.id,
        title: "Approve command",
        description: "Workspace: /tmp/project\nPrompt: Run Codex",
        riskLevel: "medium",
        command: "codex run",
        createdAt: "2026-05-13T00:00:02.000Z"
      }
    });

    const approval = await service.submitApproval({
      taskId: created.task.id,
      approvalRequestId: "approval-1",
      deviceId: "binding-2",
      decision: "approved"
    });

    assert.equal(approval.deviceId, "binding-2");
    assert.equal(approval.resultPayload.status, "approved");

    await service.markCompleted({
      task: {
        id: created.task.id,
        completedAt: "2026-05-13T00:00:03.000Z"
      },
      exitCode: 0
    });

    const history = await service.getTask(created.task.id);

    assert.equal(history.task.status, "completed");
    assert.equal(history.outputs.length, 1);
    assert.equal(history.outputs[0].content, "hello");
    assert.equal(history.approvals.length, 1);
    assert.equal(history.approvals[0].status, "approved");
    assert.equal(history.approvals[0].description, "Workspace: /tmp/project\nPrompt: Run Codex");
    assert.equal(history.approvals[0].riskLevel, "medium");
    assert.equal(history.approvalResults.length, 1);
    assert.equal(history.approvalResults[0].decision, "approved");
    assert.deepEqual(
      history.events.map((event) => event.eventName),
      [
        WS_EVENTS.TASK_CREATED,
        WS_EVENTS.TASK_STARTED,
        WS_EVENTS.TASK_OUTPUT,
        WS_EVENTS.TASK_WAITING_APPROVAL,
        WS_EVENTS.TASK_APPROVAL_SUBMIT,
        WS_EVENTS.TASK_APPROVAL_RESULT,
        WS_EVENTS.TASK_COMPLETED
      ]
    );
  });

  it("stores a rejected task after a rejected approval decision", async () => {
    const created = await service.createTask({
      deviceId: "binding-3",
      prompt: "Do not run this"
    });

    await service.markWaitingApproval({
      task: {
        id: created.task.id
      },
      approval: {
        id: "approval-2",
        taskId: created.task.id,
        title: "Approve Codex task",
        description: "Workspace: /tmp/project\nPrompt: Do not run this",
        riskLevel: "medium",
        createdAt: "2026-05-13T00:00:02.000Z"
      }
    });

    const approval = await service.submitApproval({
      taskId: created.task.id,
      approvalRequestId: "approval-2",
      deviceId: "binding-3",
      decision: "rejected",
      reason: "Not now"
    });

    assert.equal(approval.resultPayload.status, "rejected");
    assert.equal(approval.submitPayload.decision, "rejected");

    await service.markFailed({
      task: {
        id: created.task.id,
        status: "rejected",
        completedAt: "2026-05-13T00:00:03.000Z"
      },
      error: {
        code: "TASK_REJECTED",
        message: "Task rejected by mobile approval"
      }
    });

    const history = await service.getTask(created.task.id);
    assert.equal(history.task.status, "rejected");
    assert.equal(history.approvals[0].status, "rejected");
    assert.equal(history.approvalResults[0].status, "rejected");
  });

  it("searches tasks by status, creation time, and prompt keyword", async () => {
    const first = await service.createTask({
      deviceId: "binding-search",
      prompt: "Implement SQLite search"
    });
    const second = await service.createTask({
      deviceId: "binding-search",
      prompt: "Draft mobile UX"
    });

    await service.markCompleted({
      task: {
        id: first.task.id,
        completedAt: "2026-05-13T00:00:03.000Z"
      },
      exitCode: 0
    });

    const completed = await service.searchTasks({
      deviceId: "binding-search",
      statuses: ["completed"],
      prompt: "SQLite",
      createdFrom: first.task.createdAt,
      createdTo: new Date().toISOString()
    });

    assert.deepEqual(
      completed.items.map((task) => task.id),
      [first.task.id]
    );

    const created = await service.searchTasks({
      deviceId: "binding-search",
      statuses: ["created"],
      prompt: "mobile"
    });

    assert.deepEqual(
      created.items.map((task) => task.id),
      [second.task.id]
    );
  });

  it("paginates historical output chunks", async () => {
    const created = await service.createTask({
      deviceId: "binding-output",
      prompt: "Stream logs"
    });

    for (let sequence = 1; sequence <= 3; sequence += 1) {
      await service.appendOutput({
        taskId: created.task.id,
        chunk: {
          id: `chunk-${sequence}`,
          taskId: created.task.id,
          sequence,
          stream: "stdout",
          content: `line ${sequence}`,
          createdAt: `2026-05-13T00:00:0${sequence}.000Z`
        }
      });
    }

    const firstPage = await service.listTaskOutputs(created.task.id, {
      limit: 2
    });
    assert.equal(firstPage.items.length, 2);
    assert.equal(firstPage.items[1].content, "line 2");
    assert.equal(firstPage.nextCursor, "2");
    assert.equal(firstPage.hasMore, true);

    const secondPage = await service.listTaskOutputs(created.task.id, {
      cursor: "2",
      limit: 2
    });
    assert.deepEqual(
      secondPage.items.map((chunk) => chunk.content),
      ["line 3"]
    );

    const history = await service.getTask(created.task.id, {
      limit: 2
    });
    assert.equal(history.outputs.length, 2);
    assert.equal(history.outputsPage.hasMore, true);
  });

  it("cleans terminal task history without deleting active tasks by default", async () => {
    const completed = await service.createTask({
      deviceId: "binding-clean",
      prompt: "old completed"
    });
    const active = await service.createTask({
      deviceId: "binding-clean",
      prompt: "active work"
    });

    await service.markCompleted({
      task: {
        id: completed.task.id,
        completedAt: "2026-05-13T00:00:03.000Z"
      }
    });

    const result = await service.clearHistory({
      deviceId: "binding-clean"
    });

    assert.equal(result.deletedCount, 1);

    const remaining = await service.searchTasks({
      deviceId: "binding-clean"
    });
    assert.deepEqual(
      remaining.items.map((task) => task.id),
      [active.task.id]
    );
  });
});
