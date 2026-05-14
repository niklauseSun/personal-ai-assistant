import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Query
} from "@nestjs/common";
import type { AgentTaskStatus } from "@personal-ai-assistant/shared";
import { TaskService } from "./task.service";

@Controller("tasks")
export class TasksController {
  constructor(@Inject(TaskService) private readonly taskService: TaskService) {}

  @Get()
  async searchTasks(
    @Query("deviceId") deviceId: string | undefined,
    @Query("status") status: string | string[] | undefined,
    @Query("createdFrom") createdFrom: string | undefined,
    @Query("createdTo") createdTo: string | undefined,
    @Query("prompt") prompt: string | undefined,
    @Query("q") q: string | undefined,
    @Query("cursor") cursor: string | undefined,
    @Query("limit") limit: string | undefined
  ) {
    const normalizedDeviceId = this.requireDeviceId(deviceId);
    return this.taskService.searchTasks({
      deviceId: normalizedDeviceId,
      statuses: parseStatuses(status),
      createdFrom,
      createdTo,
      prompt: prompt ?? q,
      cursor,
      limit: parseOptionalPositiveInteger(limit, "limit")
    });
  }

  @Get("recoverable")
  async listRecoverableTasks(@Query("deviceId") deviceId: string | undefined) {
    return this.taskService.listRecoverableTasks(this.requireDeviceId(deviceId));
  }

  @Delete("history")
  async clearHistory(
    @Query("deviceId") deviceId: string | undefined,
    @Query("status") status: string | string[] | undefined,
    @Query("createdFrom") createdFrom: string | undefined,
    @Query("createdTo") createdTo: string | undefined,
    @Query("prompt") prompt: string | undefined,
    @Query("q") q: string | undefined,
    @Query("includeActive") includeActive: string | undefined
  ) {
    return this.taskService.clearHistory({
      deviceId: this.requireDeviceId(deviceId),
      statuses: parseStatuses(status),
      createdFrom,
      createdTo,
      prompt: prompt ?? q,
      includeActive: includeActive === "true"
    });
  }

  @Get(":id/outputs")
  async listOutputs(
    @Param("id") id: string,
    @Query("cursor") cursor: string | undefined,
    @Query("limit") limit: string | undefined
  ) {
    return this.taskService.listTaskOutputs(id, {
      cursor,
      limit: parseOptionalPositiveInteger(limit, "limit")
    });
  }

  @Get(":id")
  async getTask(
    @Param("id") id: string,
    @Query("outputCursor") outputCursor: string | undefined,
    @Query("outputLimit") outputLimit: string | undefined
  ) {
    return this.taskService.getTask(id, {
      cursor: outputCursor,
      limit: parseOptionalPositiveInteger(outputLimit, "outputLimit")
    });
  }

  private requireDeviceId(deviceId: string | undefined) {
    if (!deviceId || deviceId.trim().length === 0) {
      throw new BadRequestException("deviceId query parameter is required");
    }

    return deviceId.trim();
  }
}

function parseStatuses(status: string | string[] | undefined): AgentTaskStatus[] | undefined {
  if (!status) {
    return undefined;
  }

  const values = (Array.isArray(status) ? status : status.split(","))
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);

  if (values.length === 0) {
    return undefined;
  }

  for (const value of values) {
    if (!isAgentTaskStatus(value)) {
      throw new BadRequestException(`unsupported task status: ${value}`);
    }
  }

  return values as AgentTaskStatus[];
}

function parseOptionalPositiveInteger(value: string | undefined, label: string) {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException(`${label} must be a positive integer`);
  }

  return parsed;
}

function isAgentTaskStatus(value: string): value is AgentTaskStatus {
  return (
    value === "queued" ||
    value === "created" ||
    value === "started" ||
    value === "running" ||
    value === "waiting_approval" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "rejected"
  );
}
