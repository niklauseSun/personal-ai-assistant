import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotFoundException } from "@nestjs/common";
import { TaskService } from "./task.service";

describe("TaskService relay-only mode", () => {
  it("creates transient task payloads without persistence", async () => {
    const service = new TaskService();

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
    assert.equal(created.task.createdByDeviceId, "binding-relay");
    assert.equal(created.task.assignedDesktopDeviceId, "desktop-relay");
    assert.equal(created.task.metadata?.workspacePath, "/tmp/project");
    assert.equal(approval.submitPayload.targetDesktopId, "desktop-relay");
    assert.equal(approval.resultPayload.status, "approved");
  });

  it("validates and forwards relay event payloads", () => {
    const service = new TaskService();

    const started = service.toRelayTaskStarted({
      task: {
        id: "task-relay",
        prompt: "Run Codex",
        status: "started",
        createdByDeviceId: "binding-relay",
        assignedDesktopDeviceId: "desktop-relay",
        createdAt: "2026-05-13T00:00:00.000Z",
        updatedAt: "2026-05-13T00:00:00.000Z"
      },
      startedAt: "2026-05-13T00:00:01.000Z"
    });
    const output = service.toRelayTaskOutput({
      taskId: "task-relay",
      chunk: {
        id: "chunk-1",
        taskId: "task-relay",
        sequence: 1,
        stream: "stdout",
        content: "hello",
        createdAt: "2026-05-13T00:00:02.000Z"
      }
    });
    const approval = service.toRelayTaskWaitingApproval({
      task: {
        id: "task-relay",
        status: "waiting_approval",
        createdByDeviceId: "binding-relay"
      },
      approval: {
        id: "approval-1",
        taskId: "task-relay",
        title: "Approve command",
        description: "Workspace: /tmp/project\nPrompt: Run Codex",
        riskLevel: "medium",
        createdAt: "2026-05-13T00:00:03.000Z"
      }
    });
    const completed = service.toRelayTaskCompleted({
      task: {
        id: "task-relay",
        status: "completed",
        completedAt: "2026-05-13T00:00:04.000Z"
      },
      exitCode: 0
    });

    assert.equal(started.task.id, "task-relay");
    assert.equal(output.chunk.content, "hello");
    assert.equal(approval.approval.riskLevel, "medium");
    assert.equal(completed.exitCode, 0);
  });

  it("exposes empty non-persistent history responses", async () => {
    const service = new TaskService();

    assert.deepEqual(await service.listTasks("binding-relay"), []);
    assert.deepEqual(await service.listRecoverableTasks("binding-relay"), {
      items: [],
      hasMore: false
    });
    assert.deepEqual(await service.clearHistory({ deviceId: "binding-relay" }), {
      deletedCount: 0
    });
    assert.deepEqual(await service.listTaskOutputs("task-relay"), {
      taskId: "task-relay",
      items: [],
      hasMore: false
    });
    await assert.rejects(() => service.getTask("task-relay"), NotFoundException);
  });

  it("rejects malformed relay payloads", () => {
    const service = new TaskService();

    assert.throws(
      () =>
        service.toRelayTaskOutput({
          taskId: "task-relay",
          chunk: {
            id: "chunk-1",
            taskId: "task-relay",
            sequence: -1,
            stream: "stdout",
            content: "hello"
          }
        }),
      /chunk.sequence/
    );
    assert.throws(
      () =>
        service.toRelayApproval({
          taskId: "task-relay",
          approvalRequestId: "approval-relay",
          deviceId: "binding-relay",
          decision: "maybe"
        }),
      /decision/
    );
  });
});
