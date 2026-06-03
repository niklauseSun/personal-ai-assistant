import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  AgentTask,
  AgentTaskHistory,
  AgentTaskStatus,
  ClearTaskHistoryResult,
  OutputChunk,
  PaginatedResult,
  RiskLevel,
  TaskApprovalResultPayload,
  TaskApprovalSubmitPayload,
  TaskCancelPayload,
  TaskCompletedPayload,
  TaskCreatePayload,
  TaskCreatedPayload,
  TaskFailedPayload,
  TaskOutputPayload,
  TaskStartedPayload,
  TaskWaitingApprovalPayload
} from "@personal-ai-assistant/shared";
import {
  assertObject,
  optionalRecord,
  optionalString,
  requireString
} from "../common/payload";

export interface TaskSearchParams {
  deviceId: string;
  statuses?: AgentTaskStatus[];
  createdFrom?: string;
  createdTo?: string;
  prompt?: string;
  cursor?: string;
  limit?: number;
}

export interface OutputPageParams {
  cursor?: string;
  limit?: number;
}

export interface ClearTaskHistoryParams extends TaskSearchParams {
  includeActive?: boolean;
}

@Injectable()
export class TaskService {
  createTask(rawPayload: unknown): TaskCreatedPayload {
    return this.createTransientTask(rawPayload);
  }

  createTransientTask(rawPayload: unknown): TaskCreatedPayload {
    const payload = this.parseTaskCreatePayload(rawPayload);
    const now = new Date().toISOString();

    return {
      task: {
        id: payload.requestId ?? randomUUID(),
        prompt: payload.prompt,
        status: "created",
        createdByDeviceId: payload.deviceId,
        assignedDesktopDeviceId: payload.targetDesktopId,
        createdAt: now,
        updatedAt: now,
        metadata: payload.metadata
      }
    };
  }

  toRelayTaskStarted(rawPayload: unknown): TaskStartedPayload {
    return this.parseTaskStartedPayload(rawPayload);
  }

  toRelayTaskOutput(rawPayload: unknown): TaskOutputPayload {
    return this.parseTaskOutputPayload(rawPayload);
  }

  toRelayTaskWaitingApproval(rawPayload: unknown): TaskWaitingApprovalPayload {
    return this.parseTaskWaitingApprovalPayload(rawPayload);
  }

  toRelayTaskCompleted(rawPayload: unknown): TaskCompletedPayload {
    return this.parseTaskCompletedPayload(rawPayload);
  }

  toRelayTaskFailed(rawPayload: unknown): TaskFailedPayload {
    return this.parseTaskFailedPayload(rawPayload);
  }

  toRelayTaskCancel(rawPayload: unknown): TaskCancelPayload {
    return this.parseTaskCancelPayload(rawPayload);
  }

  toRelayApproval(rawPayload: unknown): {
    submitPayload: TaskApprovalSubmitPayload;
    resultPayload: TaskApprovalResultPayload;
  } {
    const submitPayload = this.parseTaskApprovalSubmitPayload(rawPayload);
    const resolvedAt = new Date().toISOString();

    return {
      submitPayload,
      resultPayload: {
        taskId: submitPayload.taskId,
        approvalRequestId: submitPayload.approvalRequestId,
        status: submitPayload.decision,
        decision: submitPayload.decision,
        resolvedByDeviceId: submitPayload.deviceId,
        resolvedAt,
        reason: submitPayload.reason
      }
    };
  }

  async listTasks(deviceId: string): Promise<AgentTask[]> {
    return (await this.searchTasks({ deviceId })).items;
  }

  async searchTasks(_params: TaskSearchParams): Promise<PaginatedResult<AgentTask>> {
    return {
      items: [],
      hasMore: false
    };
  }

  async listRecoverableTasks(deviceId: string): Promise<PaginatedResult<AgentTask>> {
    return this.searchTasks({ deviceId });
  }

  async clearHistory(_params: ClearTaskHistoryParams): Promise<ClearTaskHistoryResult> {
    return {
      deletedCount: 0
    };
  }

  async listTaskOutputs(taskId: string, _params: OutputPageParams = {}) {
    return {
      taskId,
      items: [] as OutputChunk[],
      hasMore: false
    };
  }

  async listApprovalResults(_taskId: string): Promise<TaskApprovalResultPayload[]> {
    return [];
  }

  async getTask(_taskId: string, _outputParams: OutputPageParams = {}): Promise<AgentTaskHistory> {
    throw new NotFoundException("server task history is disabled");
  }

  async getTaskTargetDesktopId(_taskId: string): Promise<string | undefined> {
    return undefined;
  }

  private parseTaskCreatePayload(rawPayload: unknown): TaskCreatePayload {
    assertObject(rawPayload, "task.create payload");
    return {
      deviceId: requireString(rawPayload.deviceId, "deviceId"),
      targetDesktopId: optionalString(rawPayload.targetDesktopId, "targetDesktopId"),
      prompt: requireString(rawPayload.prompt, "prompt"),
      requestId: optionalString(rawPayload.requestId, "requestId"),
      metadata: optionalRecord(rawPayload.metadata, "metadata")
    };
  }

  private parseTaskStartedPayload(rawPayload: unknown): TaskStartedPayload {
    assertObject(rawPayload, "task.started payload");
    const task = this.extractTaskRef(rawPayload.task);
    return {
      task,
      startedAt: optionalString(rawPayload.startedAt, "startedAt") ?? new Date().toISOString()
    };
  }

  private parseTaskOutputPayload(rawPayload: unknown): TaskOutputPayload {
    assertObject(rawPayload, "task.output payload");
    assertObject(rawPayload.chunk, "chunk");

    const stream = requireString(rawPayload.chunk.stream, "chunk.stream");
    if (stream !== "stdout" && stream !== "stderr" && stream !== "system") {
      throw new BadRequestException("chunk.stream must be stdout, stderr, or system");
    }

    const sequence = rawPayload.chunk.sequence;
    if (typeof sequence !== "number" || !Number.isInteger(sequence) || sequence < 0) {
      throw new BadRequestException("chunk.sequence must be a non-negative integer");
    }

    return {
      taskId: requireString(rawPayload.taskId, "taskId"),
      chunk: {
        id: requireString(rawPayload.chunk.id, "chunk.id"),
        taskId: requireString(rawPayload.chunk.taskId, "chunk.taskId"),
        sequence,
        stream,
        content: requireString(rawPayload.chunk.content, "chunk.content"),
        createdAt:
          optionalString(rawPayload.chunk.createdAt, "chunk.createdAt") ??
          new Date().toISOString()
      }
    };
  }

  private parseTaskWaitingApprovalPayload(rawPayload: unknown): TaskWaitingApprovalPayload {
    assertObject(rawPayload, "task.waiting_approval payload");
    assertObject(rawPayload.approval, "approval");

    const task = this.extractTaskRef(rawPayload.task);
    const description =
      optionalString(rawPayload.approval.description, "approval.description") ??
      optionalString(rawPayload.approval.message, "approval.message");

    return {
      task,
      approval: {
        id: requireString(rawPayload.approval.id, "approval.id"),
        taskId: requireString(rawPayload.approval.taskId, "approval.taskId"),
        status: "pending",
        title: requireString(rawPayload.approval.title, "approval.title"),
        description,
        riskLevel: this.parseRiskLevel(rawPayload.approval.riskLevel),
        message: optionalString(rawPayload.approval.message, "approval.message"),
        command: optionalString(rawPayload.approval.command, "approval.command"),
        metadata: optionalRecord(rawPayload.approval.metadata, "approval.metadata"),
        createdAt:
          optionalString(rawPayload.approval.createdAt, "approval.createdAt") ??
          new Date().toISOString()
      }
    };
  }

  private parseTaskApprovalSubmitPayload(rawPayload: unknown): TaskApprovalSubmitPayload {
    assertObject(rawPayload, "task.approval.submit payload");

    const decision = requireString(rawPayload.decision, "decision");
    if (decision !== "approved" && decision !== "rejected") {
      throw new BadRequestException("decision must be approved or rejected");
    }

    return {
      taskId: requireString(rawPayload.taskId, "taskId"),
      approvalRequestId: requireString(rawPayload.approvalRequestId, "approvalRequestId"),
      deviceId: requireString(rawPayload.deviceId, "deviceId"),
      targetDesktopId: optionalString(rawPayload.targetDesktopId, "targetDesktopId"),
      decision,
      reason: optionalString(rawPayload.reason, "reason")
    };
  }

  private parseTaskCompletedPayload(rawPayload: unknown): TaskCompletedPayload {
    assertObject(rawPayload, "task.completed payload");
    const task = this.extractTaskRef(rawPayload.task);

    return {
      task,
      exitCode: this.optionalExitCode(rawPayload.exitCode)
    };
  }

  private parseTaskFailedPayload(rawPayload: unknown): TaskFailedPayload {
    assertObject(rawPayload, "task.failed payload");
    assertObject(rawPayload.error, "error");
    const task = this.extractTaskRef(rawPayload.task);

    return {
      task,
      error: {
        code: requireString(rawPayload.error.code, "error.code"),
        message: requireString(rawPayload.error.message, "error.message"),
        details: rawPayload.error.details
      },
      exitCode: this.optionalExitCode(rawPayload.exitCode)
    };
  }

  private parseTaskCancelPayload(rawPayload: unknown): TaskCancelPayload {
    assertObject(rawPayload, "task.cancel payload");
    return {
      taskId: requireString(rawPayload.taskId, "taskId"),
      deviceId: requireString(rawPayload.deviceId, "deviceId"),
      targetDesktopId: optionalString(rawPayload.targetDesktopId, "targetDesktopId"),
      reason: optionalString(rawPayload.reason, "reason")
    };
  }

  private extractTaskRef(value: unknown): AgentTask {
    assertObject(value, "task");
    const now = new Date().toISOString();

    return {
      id: requireString(value.id, "task.id"),
      prompt: optionalString(value.prompt, "task.prompt") ?? "",
      status: this.parseAgentTaskStatus(value.status),
      createdByDeviceId: optionalString(value.createdByDeviceId, "task.createdByDeviceId") ?? "",
      assignedDesktopDeviceId: optionalString(
        value.assignedDesktopDeviceId,
        "task.assignedDesktopDeviceId"
      ),
      createdAt: optionalString(value.createdAt, "task.createdAt") ?? now,
      updatedAt: optionalString(value.updatedAt, "task.updatedAt") ?? now,
      startedAt: optionalString(value.startedAt, "task.startedAt"),
      completedAt: optionalString(value.completedAt, "task.completedAt"),
      metadata: optionalRecord(value.metadata, "task.metadata")
    };
  }

  private parseAgentTaskStatus(value: unknown): AgentTaskStatus {
    if (value === undefined || value === null) {
      return "running";
    }

    if (
      value === "queued" ||
      value === "created" ||
      value === "started" ||
      value === "running" ||
      value === "waiting_approval" ||
      value === "completed" ||
      value === "failed" ||
      value === "cancelled" ||
      value === "rejected"
    ) {
      return value;
    }

    throw new BadRequestException("task.status is invalid");
  }

  private parseRiskLevel(value: unknown): RiskLevel {
    if (value === undefined || value === null) {
      return "medium";
    }

    if (value === "low" || value === "medium" || value === "high") {
      return value;
    }

    throw new BadRequestException("approval.riskLevel must be low, medium, or high");
  }

  private optionalExitCode(value: unknown): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new BadRequestException("exitCode must be an integer");
    }

    return value;
  }
}
