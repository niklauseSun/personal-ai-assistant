import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  AgentTask,
  DeviceOnlinePayload,
  TaskApprovalSubmitPayload,
  TaskCreatedPayload,
  TaskFailedPayload,
  TaskStartedPayload,
  TaskWaitingApprovalPayload
} from "@personal-ai-assistant/shared";
import type {
  CodexApprovalNeededEvent,
  CodexRunHandle,
  CodexRunRequest,
  CodexRunner
} from "./codex-runner";
import type { DesktopWebSocketClient } from "./desktop-websocket-client";
import { TaskRuntimeManager } from "./task-runtime-manager";

const createdAt = "2026-05-14T00:00:00.000Z";

interface FakeClient {
  client: DesktopWebSocketClient;
  emitTaskCreated: (payload: TaskCreatedPayload) => void;
  emitApprovalSubmit: (payload: TaskApprovalSubmitPayload) => void;
  emitDeviceOnline: (payload?: Partial<DeviceOnlinePayload>) => void;
  waitingApprovals: TaskWaitingApprovalPayload[];
  startedTasks: TaskStartedPayload[];
  failedTasks: TaskFailedPayload[];
}

class FakeRunHandle implements CodexRunHandle {
  readonly process = {} as CodexRunHandle["process"];
  readonly completed = new Promise<never>(() => undefined);
  readonly writes: string[] = [];
  killed = false;
  approvalsResolved = 0;

  constructor(readonly taskId: string) {}

  write(input: string) {
    this.writes.push(input);
  }

  resolveApproval() {
    this.approvalsResolved += 1;
  }

  kill() {
    this.killed = true;
  }
}

class FakeRunner {
  readonly started: CodexRunRequest[] = [];
  lastHandle?: FakeRunHandle;
  private approvalNeededHandler?: (event: CodexApprovalNeededEvent) => void;

  async start(
    request: CodexRunRequest,
    _onOutput: () => void,
    onSpawn?: () => void,
    onApprovalNeeded?: (event: CodexApprovalNeededEvent) => void
  ): Promise<CodexRunHandle> {
    this.started.push(request);
    this.approvalNeededHandler = onApprovalNeeded;
    this.lastHandle = new FakeRunHandle(request.taskId);
    onSpawn?.();

    return this.lastHandle;
  }

  emitApprovalNeeded(event: Partial<CodexApprovalNeededEvent> = {}) {
    this.approvalNeededHandler?.({
      reason: "keyword",
      evidence: "Allow Codex to continue? [y/n]",
      detectedAt: createdAt,
      content: "Allow Codex to continue? [y/n]",
      rawContent: "\u001B[33mAllow Codex to continue? [y/n]\u001B[0m",
      ...event
    });
  }
}

function createFakeClient(): FakeClient {
  let taskCreatedHandler: ((payload: TaskCreatedPayload) => void) | undefined;
  let approvalSubmitHandler: ((payload: TaskApprovalSubmitPayload) => void) | undefined;
  let deviceOnlineHandler: ((payload: DeviceOnlinePayload) => void) | undefined;
  const waitingApprovals: TaskWaitingApprovalPayload[] = [];
  const startedTasks: TaskStartedPayload[] = [];
  const failedTasks: TaskFailedPayload[] = [];

  const client = {
    onTaskCreated: (handler: (payload: TaskCreatedPayload) => void) => {
      taskCreatedHandler = handler;
    },
    onTaskCancel: () => undefined,
    onApprovalSubmit: (handler: (payload: TaskApprovalSubmitPayload) => void) => {
      approvalSubmitHandler = handler;
    },
    onDeviceOnline: (handler: (payload: DeviceOnlinePayload) => void) => {
      deviceOnlineHandler = handler;
    },
    sendTaskWaitingApproval: (payload: TaskWaitingApprovalPayload) => {
      waitingApprovals.push(payload);
    },
    sendTaskStarted: (payload: TaskStartedPayload) => {
      startedTasks.push(payload);
    },
    sendTaskOutput: () => undefined,
    sendTaskCompleted: () => undefined,
    sendTaskFailed: (payload: TaskFailedPayload) => {
      failedTasks.push(payload);
    }
  } as unknown as DesktopWebSocketClient;

  return {
    client,
    emitTaskCreated: (payload) => taskCreatedHandler?.(payload),
    emitApprovalSubmit: (payload) => approvalSubmitHandler?.(payload),
    emitDeviceOnline: (payload = {}) =>
      deviceOnlineHandler?.({
        session: {
          deviceId: "device-1",
          clientType: "desktop",
          status: "online",
          registeredAt: createdAt,
          lastSeenAt: createdAt
        },
        serverTime: createdAt,
        ...payload
      }),
    waitingApprovals,
    startedTasks,
    failedTasks
  };
}

function taskCreatedPayload(): TaskCreatedPayload {
  return {
    task: {
      id: "task-1",
      prompt: "Implement approval gating before Codex starts.",
      status: "created",
      createdByDeviceId: "device-1",
      createdAt,
      updatedAt: createdAt,
      metadata: {
        workspacePath: "/tmp/project"
      }
    }
  };
}

describe("TaskRuntimeManager approvals", () => {
  it("requests mobile approval before starting Codex", () => {
    const fakeClient = createFakeClient();
    const fakeRunner = new FakeRunner();
    const manager = new TaskRuntimeManager({
      client: fakeClient.client,
      runner: fakeRunner as unknown as CodexRunner
    });

    manager.attach();
    fakeClient.emitTaskCreated(taskCreatedPayload());

    assert.equal(fakeRunner.started.length, 0);
    assert.equal(fakeClient.waitingApprovals.length, 1);
    assert.equal(fakeClient.waitingApprovals[0].task.status, "waiting_approval");
    assert.equal(fakeClient.waitingApprovals[0].approval.title, "Approve Codex task");
    assert.equal(fakeClient.waitingApprovals[0].approval.riskLevel, "medium");
    assert.match(fakeClient.waitingApprovals[0].approval.description ?? "", /\/tmp\/project/);
    assert.match(
      fakeClient.waitingApprovals[0].approval.description ?? "",
      /Implement approval gating/
    );
  });

  it("starts Codex only after an approved decision", async () => {
    const fakeClient = createFakeClient();
    const fakeRunner = new FakeRunner();
    const manager = new TaskRuntimeManager({
      client: fakeClient.client,
      runner: fakeRunner as unknown as CodexRunner
    });

    manager.attach();
    fakeClient.emitTaskCreated(taskCreatedPayload());
    const approvalRequestId = fakeClient.waitingApprovals[0].approval.id;

    fakeClient.emitApprovalSubmit({
      taskId: "task-1",
      approvalRequestId,
      deviceId: "device-1",
      decision: "approved"
    });

    await Promise.resolve();

    assert.equal(fakeRunner.started.length, 1);
    assert.equal(fakeClient.startedTasks.length, 1);
    assert.equal(fakeClient.startedTasks[0].task.status, "started");
  });

  it("marks a rejected approval as a rejected task", () => {
    const fakeClient = createFakeClient();
    const fakeRunner = new FakeRunner();
    const manager = new TaskRuntimeManager({
      client: fakeClient.client,
      runner: fakeRunner as unknown as CodexRunner
    });

    manager.attach();
    fakeClient.emitTaskCreated(taskCreatedPayload());
    const approvalRequestId = fakeClient.waitingApprovals[0].approval.id;

    fakeClient.emitApprovalSubmit({
      taskId: "task-1",
      approvalRequestId,
      deviceId: "device-1",
      decision: "rejected",
      reason: "Too risky"
    });

    assert.equal(fakeRunner.started.length, 0);
    assert.equal(fakeClient.failedTasks.length, 1);
    assert.equal(fakeClient.failedTasks[0].task.status, "rejected");
    assert.equal(fakeClient.failedTasks[0].error.code, "TASK_REJECTED");
  });

  it("requests a second approval when the running pty appears to wait for confirmation", async () => {
    const fakeClient = createFakeClient();
    const fakeRunner = new FakeRunner();
    const manager = new TaskRuntimeManager({
      client: fakeClient.client,
      runner: fakeRunner as unknown as CodexRunner
    });

    manager.attach();
    fakeClient.emitTaskCreated(taskCreatedPayload());
    fakeClient.emitApprovalSubmit({
      taskId: "task-1",
      approvalRequestId: fakeClient.waitingApprovals[0].approval.id,
      deviceId: "device-1",
      decision: "approved"
    });

    await Promise.resolve();
    fakeRunner.emitApprovalNeeded();

    assert.equal(fakeClient.waitingApprovals.length, 2);
    assert.equal(fakeClient.waitingApprovals[1].task.status, "waiting_approval");
    assert.equal(fakeClient.waitingApprovals[1].approval.riskLevel, "medium");
    assert.match(fakeClient.waitingApprovals[1].approval.description ?? "", /interactive/);
    assert.match(fakeClient.waitingApprovals[1].approval.description ?? "", /y\/n/);
  });

  it("writes approval input back to the running pty", async () => {
    const fakeClient = createFakeClient();
    const fakeRunner = new FakeRunner();
    const manager = new TaskRuntimeManager({
      client: fakeClient.client,
      runner: fakeRunner as unknown as CodexRunner
    });

    manager.attach();
    fakeClient.emitTaskCreated(taskCreatedPayload());
    fakeClient.emitApprovalSubmit({
      taskId: "task-1",
      approvalRequestId: fakeClient.waitingApprovals[0].approval.id,
      deviceId: "device-1",
      decision: "approved"
    });

    await Promise.resolve();
    fakeRunner.emitApprovalNeeded();
    fakeClient.emitApprovalSubmit({
      taskId: "task-1",
      approvalRequestId: fakeClient.waitingApprovals[1].approval.id,
      deviceId: "device-1",
      decision: "approved"
    });

    assert.deepEqual(fakeRunner.lastHandle?.writes, ["y\r"]);
    assert.equal(fakeRunner.lastHandle?.approvalsResolved, 1);
  });

  it("writes rejection input, interrupts the pty, and marks the task rejected", async () => {
    const fakeClient = createFakeClient();
    const fakeRunner = new FakeRunner();
    const manager = new TaskRuntimeManager({
      client: fakeClient.client,
      runner: fakeRunner as unknown as CodexRunner
    });

    manager.attach();
    fakeClient.emitTaskCreated(taskCreatedPayload());
    fakeClient.emitApprovalSubmit({
      taskId: "task-1",
      approvalRequestId: fakeClient.waitingApprovals[0].approval.id,
      deviceId: "device-1",
      decision: "approved"
    });

    await Promise.resolve();
    fakeRunner.emitApprovalNeeded();
    fakeClient.emitApprovalSubmit({
      taskId: "task-1",
      approvalRequestId: fakeClient.waitingApprovals[1].approval.id,
      deviceId: "device-1",
      decision: "rejected",
      reason: "Stop here"
    });

    assert.deepEqual(fakeRunner.lastHandle?.writes, ["n\r", "\x03"]);
    assert.equal(fakeRunner.lastHandle?.approvalsResolved, 1);
    assert.equal(fakeRunner.lastHandle?.killed, true);
    assert.equal(fakeClient.failedTasks.at(-1)?.task.status, "rejected");
  });

  it("restores unfinished task state on reconnect without rerunning tasks", async () => {
    const fakeClient = createFakeClient();
    const fakeRunner = new FakeRunner();
    let requestedDeviceId: string | undefined;
    const recoverableTask: AgentTask = {
      ...taskCreatedPayload().task,
      status: "waiting_approval"
    };
    const manager = new TaskRuntimeManager({
      client: fakeClient.client,
      runner: fakeRunner as unknown as CodexRunner,
      deviceId: "device-1",
      historyClient: {
        listRecoverableTasks: async (deviceId) => {
          requestedDeviceId = deviceId;
          return [recoverableTask];
        }
      }
    });

    manager.attach();
    fakeClient.emitDeviceOnline();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(requestedDeviceId, "device-1");
    assert.equal(fakeRunner.started.length, 0);
    assert.equal(fakeClient.waitingApprovals.length, 0);
  });
});
