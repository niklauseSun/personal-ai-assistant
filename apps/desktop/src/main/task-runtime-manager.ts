import { randomUUID } from "node:crypto";
import type {
  AgentTask,
  ApprovalRequest,
  OutputStream,
  SharedError,
  TaskApprovalSubmitPayload,
  TaskCancelPayload,
  TaskCreatedPayload
} from "@personal-ai-assistant/shared";
import {
  CodexCliNotFoundError,
  CodexRunner,
  type CodexApprovalNeededEvent,
  type CodexRunHandle
} from "./codex-runner";
import type { DesktopTaskHistoryClient } from "./desktop-api-client";
import { DesktopWebSocketClient } from "./desktop-websocket-client";
import { Logger } from "./logger";
import {
  WorkspacePathError,
  getWorkspacePathFromTaskMetadata,
  resolveWorkspacePath
} from "./workspace";

export interface TaskRuntimeManagerOptions {
  client: DesktopWebSocketClient;
  runner?: CodexRunner;
  defaultWorkspacePath?: string;
  deviceId?: string;
  historyClient?: DesktopTaskHistoryClient;
  logger?: Logger;
}

export class TaskRuntimeManager {
  private readonly runner: CodexRunner;
  private readonly logger: Logger;
  private activeTask?: AgentTask;
  private activeHandle?: CodexRunHandle;
  private pendingRuntimeApproval?: ApprovalRequest;
  private outputSequence = 0;

  constructor(private readonly options: TaskRuntimeManagerOptions) {
    this.runner = options.runner ?? new CodexRunner();
    this.logger = options.logger ?? new Logger("runtime");
  }

  attach() {
    this.options.client.onTaskCreated((payload) => {
      this.requestTaskApproval(payload);
    });
    this.options.client.onTaskCancel((payload) => {
      this.cancelTask(payload);
    });
    this.options.client.onApprovalSubmit((payload) => {
      this.handleApprovalSubmit(payload);
    });
    this.options.client.onDeviceOnline(() => {
      void this.restoreUnfinishedTasks();
    });
  }

  cancelActiveTask() {
    this.activeHandle?.kill();
  }

  private requestTaskApproval(payload: TaskCreatedPayload) {
    const task = payload.task;

    if (this.activeTask || this.activeHandle) {
      this.logger.warn("rejecting task because another task is active", {
        activeTaskId: this.activeTask?.id ?? this.activeHandle?.taskId,
        nextTaskId: task.id
      });
      this.sendFailed(task, {
        code: "TASK_ALREADY_RUNNING",
        message: `Desktop is already running task ${
          this.activeTask?.id ?? this.activeHandle?.taskId
        }`
      });
      return;
    }

    this.activeTask = task;
    this.outputSequence = 0;

    const workspacePath = resolveWorkspacePath(
      getWorkspacePathFromTaskMetadata(task.metadata),
      this.options.defaultWorkspacePath
    );
    const approval = this.createApprovalRequest(task, workspacePath);
    const now = approval.createdAt;

    this.logger.info("requesting mobile approval before starting codex", {
      taskId: task.id,
      approvalRequestId: approval.id,
      workspacePath
    });

    this.options.client.sendTaskWaitingApproval({
      task: {
        ...task,
        status: "waiting_approval",
        updatedAt: now
      },
      approval
    });
  }

  private async startApprovedTask(task: AgentTask) {
    try {
      const workspacePath = resolveWorkspacePath(
        getWorkspacePathFromTaskMetadata(task.metadata),
        this.options.defaultWorkspacePath
      );
      const handle = await this.runner.start(
        {
          taskId: task.id,
          prompt: task.prompt,
          workspacePath
        },
        (output) => this.sendOutput(task, output.stream, output.content),
        () => this.sendStarted(task),
        (approval) => this.requestRuntimeApproval(task, approval)
      );

      this.activeHandle = handle;
      void handle.completed
        .then((result) => {
          if (result.cancelled) {
            this.logger.warn("task process cancelled", {
              taskId: task.id
            });
            return;
          }

          if (result.exitCode === 0) {
            this.sendCompleted(task, result.exitCode);
            return;
          }

          this.sendFailed(
            task,
            {
              code: result.signal ? "CODEX_TERMINATED" : "CODEX_EXITED_NON_ZERO",
              message: result.signal
                ? `Codex process terminated with signal ${result.signal}`
                : `Codex process exited with code ${result.exitCode ?? "unknown"}`
            },
            result.exitCode ?? undefined
          );
        })
        .catch((error) => {
          this.sendFailed(task, this.toSharedError(error));
        })
        .finally(() => {
          if (this.activeHandle?.taskId === task.id) {
            this.activeHandle = undefined;
            this.activeTask = undefined;
            this.pendingRuntimeApproval = undefined;
          }
        });
    } catch (error) {
      this.sendFailed(task, this.toSharedError(error));
      this.activeHandle = undefined;
      this.activeTask = undefined;
      this.pendingRuntimeApproval = undefined;
    }
  }

  private cancelTask(payload: TaskCancelPayload) {
    if (this.activeTask?.id === payload.taskId && !this.activeHandle) {
      this.logger.warn("clearing pending task approval after cancellation", {
        taskId: payload.taskId
      });
      this.activeTask = undefined;
      this.pendingRuntimeApproval = undefined;
      return;
    }

    if (!this.activeHandle || this.activeHandle.taskId !== payload.taskId) {
      this.logger.warn("no active task to cancel", {
        taskId: payload.taskId
      });
      return;
    }

    this.activeHandle.kill();
    this.pendingRuntimeApproval = undefined;
  }

  private handleApprovalSubmit(payload: TaskApprovalSubmitPayload) {
    this.logger.info("approval decision received for active process", {
      taskId: payload.taskId,
      approvalRequestId: payload.approvalRequestId,
      decision: payload.decision
    });

    const task = this.activeTask;
    if (!task || task.id !== payload.taskId) {
      this.logger.warn("ignored approval for inactive task", {
        taskId: payload.taskId
      });
      return;
    }

    if (this.activeHandle) {
      this.handleRuntimeApprovalSubmit(task, payload);
      return;
    }

    if (payload.decision === "rejected") {
      this.sendRejected(task, payload.reason);
      this.activeTask = undefined;
      return;
    }

    void this.startApprovedTask(task);
  }

  private requestRuntimeApproval(task: AgentTask, detection: CodexApprovalNeededEvent) {
    if (this.pendingRuntimeApproval) {
      return;
    }

    const approval: ApprovalRequest = {
      id: randomUUID(),
      taskId: task.id,
      status: "pending",
      title: "Approve Codex task",
      description: this.runtimeApprovalDescription(detection),
      riskLevel: "medium",
      metadata: {
        reason: detection.reason,
        evidence: detection.evidence
      },
      createdAt: detection.detectedAt
    };

    this.pendingRuntimeApproval = approval;
    this.logger.info("requesting mobile approval for running codex pty", {
      taskId: task.id,
      approvalRequestId: approval.id,
      reason: detection.reason
    });

    this.options.client.sendTaskWaitingApproval({
      task: {
        ...task,
        status: "waiting_approval",
        updatedAt: approval.createdAt
      },
      approval
    });
  }

  private handleRuntimeApprovalSubmit(task: AgentTask, payload: TaskApprovalSubmitPayload) {
    const approval = this.pendingRuntimeApproval;
    if (!approval || approval.id !== payload.approvalRequestId) {
      this.logger.warn("ignored approval that does not match the pending pty prompt", {
        taskId: payload.taskId,
        approvalRequestId: payload.approvalRequestId
      });
      return;
    }

    if (!this.activeHandle) {
      return;
    }

    if (payload.decision === "approved") {
      this.activeHandle.write("y\r");
      this.activeHandle.resolveApproval();
      this.pendingRuntimeApproval = undefined;
      return;
    }

    this.activeHandle.write("n\r");
    this.activeHandle.write("\x03");
    this.activeHandle.resolveApproval();
    this.pendingRuntimeApproval = undefined;
    this.sendRejected(task, payload.reason);
    this.activeHandle.kill();
    this.activeTask = undefined;
  }

  private runtimeApprovalDescription(detection: CodexApprovalNeededEvent) {
    const evidence = detection.evidence || "No recent terminal output.";
    return [
      "Codex appears to be waiting for an interactive confirmation.",
      `Reason: ${detection.reason}`,
      `Evidence: ${evidence}`
    ].join("\n");
  }

  private async restoreUnfinishedTasks() {
    const historyClient = this.options.historyClient;
    const deviceId = this.options.deviceId;
    if (!historyClient || !deviceId) {
      return;
    }

    try {
      const tasks = await historyClient.listRecoverableTasks(deviceId);
      if (tasks.length === 0) {
        return;
      }

      this.logger.warn("recovered unfinished task state after reconnect without rerunning", {
        taskIds: tasks.map((task) => task.id),
        statuses: tasks.map((task) => task.status)
      });
    } catch (error) {
      this.logger.error("failed to restore unfinished task state", {
        message: error instanceof Error ? error.message : "unknown error"
      });
    }
  }

  private createApprovalRequest(
    task: AgentTask,
    workspacePath: string | undefined
  ): ApprovalRequest {
    const promptSummary = this.summarizePrompt(task.prompt);
    const displayWorkspacePath = workspacePath || "(not provided)";

    return {
      id: randomUUID(),
      taskId: task.id,
      status: "pending",
      title: "Approve Codex task",
      description: `Workspace: ${displayWorkspacePath}\nPrompt: ${promptSummary}`,
      riskLevel: "medium",
      metadata: {
        workspacePath: displayWorkspacePath,
        promptSummary
      },
      createdAt: new Date().toISOString()
    };
  }

  private summarizePrompt(prompt: string) {
    const normalized = prompt.replace(/\s+/g, " ").trim();
    if (normalized.length <= 180) {
      return normalized;
    }

    return `${normalized.slice(0, 177)}...`;
  }

  private sendStarted(task: AgentTask) {
    const now = new Date().toISOString();
    this.options.client.sendTaskStarted({
      task: {
        ...task,
        status: "started",
        startedAt: now,
        updatedAt: now
      },
      startedAt: now
    });
  }

  private sendOutput(task: AgentTask, stream: OutputStream, content: string) {
    this.outputSequence += 1;
    this.options.client.sendTaskOutput({
      taskId: task.id,
      chunk: {
        id: randomUUID(),
        taskId: task.id,
        sequence: this.outputSequence,
        stream,
        content,
        createdAt: new Date().toISOString()
      }
    });
  }

  private sendCompleted(task: AgentTask, exitCode?: number) {
    const now = new Date().toISOString();
    this.options.client.sendTaskCompleted({
      task: {
        ...task,
        status: "completed",
        completedAt: now,
        updatedAt: now
      },
      exitCode
    });
  }

  private sendFailed(task: AgentTask, error: SharedError, exitCode?: number) {
    const now = new Date().toISOString();
    this.options.client.sendTaskFailed({
      task: {
        ...task,
        status: "failed",
        completedAt: now,
        updatedAt: now
      },
      error,
      exitCode
    });
  }

  private sendRejected(task: AgentTask, reason?: string) {
    const now = new Date().toISOString();
    this.options.client.sendTaskFailed({
      task: {
        ...task,
        status: "rejected",
        completedAt: now,
        updatedAt: now
      },
      error: {
        code: "TASK_REJECTED",
        message: reason || "Task rejected by mobile approval"
      }
    });
  }

  private toSharedError(error: unknown): SharedError {
    if (error instanceof CodexCliNotFoundError) {
      return {
        code: "CODEX_NOT_INSTALLED",
        message: error.message
      };
    }

    if (error instanceof WorkspacePathError) {
      return {
        code: "INVALID_WORKSPACE_PATH",
        message: error.message
      };
    }

    if (error instanceof Error) {
      return {
        code: "CODEX_RUNNER_ERROR",
        message: error.message
      };
    }

    return {
      code: "CODEX_RUNNER_ERROR",
      message: "Unknown Codex runner error"
    };
  }
}
