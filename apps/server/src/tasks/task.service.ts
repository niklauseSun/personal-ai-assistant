import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  AgentTaskHistory,
  AgentTask,
  AgentTaskStatus,
  ApprovalRequest,
  ClearTaskHistoryResult,
  ClientToServerEventPayloads,
  OutputChunk,
  PaginatedResult,
  RiskLevel,
  ServerToClientEventPayloads,
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
import { WS_EVENTS } from "@personal-ai-assistant/shared";
import type {
  AgentTask as AgentTaskRecord,
  ApprovalResult as ApprovalResultRecord,
  ApprovalRequest as ApprovalRecord,
  OutputChunk as OutputChunkRecord,
  TaskEvent as TaskEventRecord
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  assertObject,
  optionalRecord,
  optionalString,
  parseDate,
  parseMetadata,
  requireString,
  stringifyMetadata
} from "../common/payload";

interface ForwardedPayload<Payload> {
  deviceId: string;
  payload: Payload;
}

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

const DEFAULT_TASK_LIMIT = 50;
const MAX_TASK_LIMIT = 100;
const DEFAULT_OUTPUT_LIMIT = 100;
const MAX_OUTPUT_LIMIT = 500;
const TERMINAL_STATUSES: AgentTaskStatus[] = ["completed", "failed", "cancelled", "rejected"];
const RECOVERABLE_STATUSES: AgentTaskStatus[] = [
  "created",
  "started",
  "running",
  "waiting_approval"
];

@Injectable()
export class TaskService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createTask(rawPayload: unknown, connectionId?: string): Promise<TaskCreatedPayload> {
    const payload = this.parseTaskCreatePayload(rawPayload);

    const task = await this.prisma.agentTask.create({
      data: {
        deviceId: payload.deviceId,
        prompt: payload.prompt,
        status: "created",
        assignedDesktopDeviceId: payload.deviceId,
        createdByConnectionId: connectionId,
        metadataJson: stringifyMetadata(payload.metadata)
      }
    });

    const response = {
      task: this.toAgentTask(task)
    };

    await this.recordEvent(task.id, WS_EVENTS.TASK_CREATED, response);
    return response;
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
        assignedDesktopDeviceId: payload.deviceId,
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

  async markStarted(
    rawPayload: unknown
  ): Promise<ForwardedPayload<ServerToClientEventPayloads[typeof WS_EVENTS.TASK_STARTED]>> {
    const payload = this.parseTaskStartedPayload(rawPayload);
    const startedAt = parseDate(payload.startedAt);

    const task = await this.prisma.agentTask.update({
      where: { id: payload.task.id },
      data: {
        status: "started",
        startedAt
      }
    });

    const response = {
      task: this.toAgentTask(task),
      startedAt: startedAt.toISOString()
    };

    await this.recordEvent(task.id, WS_EVENTS.TASK_STARTED, response);
    return {
      deviceId: task.deviceId,
      payload: response
    };
  }

  async appendOutput(
    rawPayload: unknown
  ): Promise<ForwardedPayload<ServerToClientEventPayloads[typeof WS_EVENTS.TASK_OUTPUT]>> {
    const payload = this.parseTaskOutputPayload(rawPayload);
    const task = await this.getTaskRecord(payload.taskId);
    const createdAt = parseDate(payload.chunk.createdAt);

    const chunk = await this.prisma.outputChunk.upsert({
      where: {
        taskId_sequence: {
          taskId: payload.taskId,
          sequence: payload.chunk.sequence
        }
      },
      create: {
        id: payload.chunk.id,
        taskId: payload.taskId,
        sequence: payload.chunk.sequence,
        stream: payload.chunk.stream,
        content: payload.chunk.content,
        createdAt
      },
      update: {
        stream: payload.chunk.stream,
        content: payload.chunk.content,
        createdAt
      }
    });

    const response = {
      taskId: task.id,
      chunk: this.toOutputChunk(chunk)
    };

    await this.recordEvent(task.id, WS_EVENTS.TASK_OUTPUT, response);
    return {
      deviceId: task.deviceId,
      payload: response
    };
  }

  async markWaitingApproval(
    rawPayload: unknown
  ): Promise<
    ForwardedPayload<ServerToClientEventPayloads[typeof WS_EVENTS.TASK_WAITING_APPROVAL]>
  > {
    const payload = this.parseTaskWaitingApprovalPayload(rawPayload);
    const createdAt = parseDate(payload.approval.createdAt);

    const task = await this.prisma.agentTask.update({
      where: { id: payload.task.id },
      data: {
        status: "waiting_approval"
      }
    });

    const approval = await this.prisma.approvalRequest.upsert({
      where: {
        id: payload.approval.id
      },
      create: {
        id: payload.approval.id,
        taskId: task.id,
        status: "pending",
        title: payload.approval.title,
        description: payload.approval.description,
        riskLevel: payload.approval.riskLevel,
        message: payload.approval.message ?? payload.approval.description,
        command: payload.approval.command,
        metadataJson: stringifyMetadata(payload.approval.metadata),
        createdAt
      },
      update: {
        status: "pending",
        title: payload.approval.title,
        description: payload.approval.description,
        riskLevel: payload.approval.riskLevel,
        message: payload.approval.message ?? payload.approval.description,
        command: payload.approval.command,
        metadataJson: stringifyMetadata(payload.approval.metadata)
      }
    });

    const response = {
      task: this.toAgentTask(task),
      approval: this.toApprovalRequest(approval)
    };

    await this.recordEvent(task.id, WS_EVENTS.TASK_WAITING_APPROVAL, response);
    return {
      deviceId: task.deviceId,
      payload: response
    };
  }

  async submitApproval(rawPayload: unknown): Promise<{
    deviceId: string;
    submitPayload: TaskApprovalSubmitPayload;
    resultPayload: TaskApprovalResultPayload;
  }> {
    const payload = this.parseTaskApprovalSubmitPayload(rawPayload);
    const task = await this.getTaskRecord(payload.taskId);
    const nextStatus = payload.decision;
    const resolvedAt = new Date();

    const approval = await this.prisma.approvalRequest.findUnique({
      where: {
        id: payload.approvalRequestId
      }
    });

    if (!approval || approval.taskId !== task.id) {
      throw new NotFoundException("approval request not found for task");
    }

    if (approval.status !== "pending") {
      throw new BadRequestException("approval request has already been resolved");
    }

    await this.prisma.approvalRequest.update({
      where: {
        id: payload.approvalRequestId
      },
      data: {
        status: nextStatus,
        resolvedAt,
        resolvedByDeviceId: payload.deviceId
      }
    });

    await this.recordEvent(task.id, WS_EVENTS.TASK_APPROVAL_SUBMIT, payload);

    const resultPayload: TaskApprovalResultPayload = {
      taskId: task.id,
      approvalRequestId: payload.approvalRequestId,
      status: nextStatus,
      decision: payload.decision,
      resolvedByDeviceId: payload.deviceId,
      resolvedAt: resolvedAt.toISOString(),
      reason: payload.reason
    };

    await this.prisma.approvalResult.create({
      data: {
        taskId: task.id,
        approvalRequestId: payload.approvalRequestId,
        status: resultPayload.status,
        decision: resultPayload.decision,
        reason: resultPayload.reason,
        resolvedByDeviceId: resultPayload.resolvedByDeviceId,
        resolvedAt
      }
    });

    await this.recordEvent(task.id, WS_EVENTS.TASK_APPROVAL_RESULT, resultPayload);

    return {
      deviceId: task.deviceId,
      submitPayload: payload,
      resultPayload
    };
  }

  async markCompleted(
    rawPayload: unknown
  ): Promise<ForwardedPayload<ServerToClientEventPayloads[typeof WS_EVENTS.TASK_COMPLETED]>> {
    const payload = this.parseTaskCompletedPayload(rawPayload);
    const completedAt = parseDate(payload.task.completedAt);

    const task = await this.prisma.agentTask.update({
      where: { id: payload.task.id },
      data: {
        status: "completed",
        completedAt,
        exitCode: payload.exitCode
      }
    });

    const response = {
      task: this.toAgentTask(task),
      exitCode: payload.exitCode
    };

    await this.recordEvent(task.id, WS_EVENTS.TASK_COMPLETED, response);
    return {
      deviceId: task.deviceId,
      payload: response
    };
  }

  async markFailed(
    rawPayload: unknown
  ): Promise<ForwardedPayload<ServerToClientEventPayloads[typeof WS_EVENTS.TASK_FAILED]>> {
    const payload = this.parseTaskFailedPayload(rawPayload);
    const completedAt = parseDate(payload.task.completedAt);

    const task = await this.prisma.agentTask.update({
      where: { id: payload.task.id },
      data: {
        status: payload.task.status === "rejected" ? "rejected" : "failed",
        completedAt,
        failureCode: payload.error.code,
        failureMessage: payload.error.message,
        exitCode: payload.exitCode
      }
    });

    const response = {
      task: this.toAgentTask(task),
      error: payload.error,
      exitCode: payload.exitCode
    };

    await this.recordEvent(task.id, WS_EVENTS.TASK_FAILED, response);
    return {
      deviceId: task.deviceId,
      payload: response
    };
  }

  async cancelTask(
    rawPayload: unknown
  ): Promise<ForwardedPayload<ServerToClientEventPayloads[typeof WS_EVENTS.TASK_CANCEL]>> {
    const payload = this.parseTaskCancelPayload(rawPayload);
    const task = await this.prisma.agentTask.update({
      where: {
        id: payload.taskId
      },
      data: {
        status: "cancelled",
        completedAt: new Date()
      }
    });

    await this.recordEvent(task.id, WS_EVENTS.TASK_CANCEL, payload);
    return {
      deviceId: task.deviceId,
      payload
    };
  }

  async listTasks(deviceId: string): Promise<AgentTask[]> {
    const result = await this.searchTasks({
      deviceId
    });

    return result.items;
  }

  async searchTasks(params: TaskSearchParams): Promise<PaginatedResult<AgentTask>> {
    const limit = this.normalizeLimit(params.limit, DEFAULT_TASK_LIMIT, MAX_TASK_LIMIT);
    const tasks = await this.prisma.agentTask.findMany({
      where: this.buildTaskWhere(params),
      orderBy: [
        {
          createdAt: "desc"
        },
        {
          id: "desc"
        }
      ],
      cursor: params.cursor
        ? {
            id: params.cursor
          }
        : undefined,
      skip: params.cursor ? 1 : 0,
      take: limit + 1
    });

    const items = tasks.slice(0, limit).map((task) => this.toAgentTask(task));
    const hasMore = tasks.length > limit;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
      hasMore
    };
  }

  async listRecoverableTasks(deviceId: string): Promise<PaginatedResult<AgentTask>> {
    return this.searchTasks({
      deviceId,
      statuses: RECOVERABLE_STATUSES,
      limit: MAX_TASK_LIMIT
    });
  }

  async clearHistory(params: ClearTaskHistoryParams): Promise<ClearTaskHistoryResult> {
    const statuses = this.statusesForCleanup(params.statuses, params.includeActive ?? false);
    if (statuses.length === 0) {
      return {
        deletedCount: 0
      };
    }

    const result = await this.prisma.agentTask.deleteMany({
      where: this.buildTaskWhere({
        ...params,
        statuses
      })
    });

    return {
      deletedCount: result.count
    };
  }

  async listTaskOutputs(taskId: string, params: OutputPageParams = {}) {
    await this.getTaskRecord(taskId);
    const limit = this.normalizeLimit(params.limit, DEFAULT_OUTPUT_LIMIT, MAX_OUTPUT_LIMIT);
    const cursorSequence = this.parseOptionalNonNegativeInteger(params.cursor, "output cursor");
    const chunks = await this.prisma.outputChunk.findMany({
      where: {
        taskId,
        sequence: cursorSequence === undefined ? undefined : { gt: cursorSequence }
      },
      orderBy: {
        sequence: "asc"
      },
      take: limit + 1
    });

    const items = chunks.slice(0, limit).map((chunk) => this.toOutputChunk(chunk));
    const hasMore = chunks.length > limit;

    return {
      taskId,
      items,
      nextCursor: hasMore ? String(items[items.length - 1]?.sequence) : undefined,
      hasMore
    };
  }

  async listApprovalResults(taskId: string): Promise<TaskApprovalResultPayload[]> {
    const results = await this.prisma.approvalResult.findMany({
      where: {
        taskId
      },
      orderBy: {
        resolvedAt: "asc"
      }
    });

    return results.map((result) => this.toApprovalResult(result));
  }

  async getTask(taskId: string, outputParams: OutputPageParams = {}): Promise<AgentTaskHistory> {
    const task = await this.prisma.agentTask.findUnique({
      where: {
        id: taskId
      },
      include: {
        approvalRequests: {
          orderBy: {
            createdAt: "asc"
          }
        },
        approvalResults: {
          orderBy: {
            resolvedAt: "asc"
          }
        },
        events: {
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    });

    if (!task) {
      throw new NotFoundException("task not found");
    }

    const outputsPage = await this.listTaskOutputs(taskId, outputParams);

    return {
      task: this.toAgentTask(task),
      outputs: outputsPage.items,
      outputsPage,
      approvals: task.approvalRequests.map((approval) => this.toApprovalRequest(approval)),
      approvalResults: task.approvalResults.map((result) => this.toApprovalResult(result)),
      events: task.events.map((event) => this.toTaskEvent(event))
    };
  }

  private buildTaskWhere(params: TaskSearchParams): Prisma.AgentTaskWhereInput {
    const createdAt: Prisma.DateTimeFilter = {};
    if (params.createdFrom) {
      createdAt.gte = parseDate(params.createdFrom);
    }

    if (params.createdTo) {
      createdAt.lte = parseDate(params.createdTo);
    }

    return {
      deviceId: params.deviceId,
      status:
        params.statuses && params.statuses.length > 0
          ? {
              in: params.statuses
            }
          : undefined,
      createdAt: Object.keys(createdAt).length > 0 ? createdAt : undefined,
      prompt: params.prompt?.trim()
        ? {
            contains: params.prompt.trim()
          }
        : undefined
    };
  }

  private statusesForCleanup(
    statuses: AgentTaskStatus[] | undefined,
    includeActive: boolean
  ): AgentTaskStatus[] {
    if (includeActive) {
      return statuses && statuses.length > 0 ? statuses : [...TERMINAL_STATUSES, ...RECOVERABLE_STATUSES];
    }

    if (!statuses || statuses.length === 0) {
      return TERMINAL_STATUSES;
    }

    return statuses.filter((status) => TERMINAL_STATUSES.includes(status));
  }

  private normalizeLimit(value: number | undefined, defaultValue: number, max: number) {
    if (value === undefined) {
      return defaultValue;
    }

    if (!Number.isInteger(value) || value < 1) {
      throw new BadRequestException("limit must be a positive integer");
    }

    return Math.min(value, max);
  }

  private parseOptionalNonNegativeInteger(value: string | undefined, label: string) {
    if (value === undefined || value.trim() === "") {
      return undefined;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new BadRequestException(`${label} must be a non-negative integer`);
    }

    return parsed;
  }

  private async getTaskRecord(taskId: string) {
    const task = await this.prisma.agentTask.findUnique({
      where: {
        id: taskId
      }
    });

    if (!task) {
      throw new NotFoundException("task not found");
    }

    return task;
  }

  private async recordEvent(taskId: string, eventName: string, payload: unknown) {
    await this.prisma.taskEvent.create({
      data: {
        taskId,
        eventName,
        payloadJson: JSON.stringify(payload)
      }
    });
  }

  private toAgentTask(task: AgentTaskRecord): AgentTask {
    return {
      id: task.id,
      prompt: task.prompt,
      status: task.status as AgentTask["status"],
      createdByDeviceId: task.deviceId,
      assignedDesktopDeviceId: task.assignedDesktopDeviceId ?? undefined,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
      metadata: parseMetadata(task.metadataJson)
    };
  }

  private toOutputChunk(chunk: OutputChunkRecord): OutputChunk {
    return {
      id: chunk.id,
      taskId: chunk.taskId,
      sequence: chunk.sequence,
      stream: chunk.stream as OutputChunk["stream"],
      content: chunk.content,
      createdAt: chunk.createdAt.toISOString()
    };
  }

  private toApprovalRequest(approval: ApprovalRecord): ApprovalRequest {
    return {
      id: approval.id,
      taskId: approval.taskId,
      status: approval.status as ApprovalRequest["status"],
      title: approval.title,
      description: approval.description ?? approval.message ?? undefined,
      riskLevel: approval.riskLevel as ApprovalRequest["riskLevel"],
      message: approval.message ?? undefined,
      command: approval.command ?? undefined,
      metadata: parseMetadata(approval.metadataJson),
      createdAt: approval.createdAt.toISOString(),
      resolvedAt: approval.resolvedAt?.toISOString(),
      resolvedByDeviceId: approval.resolvedByDeviceId ?? undefined
    };
  }

  private toApprovalResult(result: ApprovalResultRecord): TaskApprovalResultPayload {
    return {
      taskId: result.taskId,
      approvalRequestId: result.approvalRequestId,
      status: result.status as TaskApprovalResultPayload["status"],
      decision: result.decision as TaskApprovalResultPayload["decision"],
      resolvedByDeviceId: result.resolvedByDeviceId,
      resolvedAt: result.resolvedAt.toISOString(),
      reason: result.reason ?? undefined
    };
  }

  private toTaskEvent(event: TaskEventRecord) {
    return {
      id: event.id,
      taskId: event.taskId,
      eventName: event.eventName,
      payload: JSON.parse(event.payloadJson),
      createdAt: event.createdAt.toISOString()
    };
  }

  private parseTaskCreatePayload(rawPayload: unknown): TaskCreatePayload {
    assertObject(rawPayload, "task.create payload");
    return {
      deviceId: requireString(rawPayload.deviceId, "deviceId"),
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
      createdAt: optionalString(value.createdAt, "task.createdAt") ?? now,
      updatedAt: optionalString(value.updatedAt, "task.updatedAt") ?? now,
      startedAt: optionalString(value.startedAt, "task.startedAt"),
      completedAt: optionalString(value.completedAt, "task.completedAt")
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
