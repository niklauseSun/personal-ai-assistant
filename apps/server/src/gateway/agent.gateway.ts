import { Inject } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException
} from "@nestjs/websockets";
import type {
  ClientType,
  ServerToClientEventName,
  ServerToClientEventPayloads
} from "@personal-ai-assistant/shared";
import { WS_EVENTS, WS_NAMESPACE } from "@personal-ai-assistant/shared";
import type { Server, Socket } from "socket.io";
import {
  DeviceConnectionService,
  type SocketBinding
} from "../devices/device-connection.service";
import { TaskService } from "../tasks/task.service";

const DEFAULT_RELAY_RETRY_ATTEMPTS = 5;
const DEFAULT_RELAY_RETRY_DELAY_MS = 100;

@WebSocketGateway({
  namespace: WS_NAMESPACE,
  cors: {
    origin: "*"
  }
})
export class AgentGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;
  private readonly relayRetryAttempts = parsePositiveInteger(
    process.env.RELAY_RETRY_ATTEMPTS,
    DEFAULT_RELAY_RETRY_ATTEMPTS
  );
  private readonly relayRetryDelayMs = parseNonNegativeInteger(
    process.env.RELAY_RETRY_DELAY_MS,
    DEFAULT_RELAY_RETRY_DELAY_MS
  );

  constructor(
    @Inject(DeviceConnectionService)
    private readonly deviceConnectionService: DeviceConnectionService,
    @Inject(TaskService)
    private readonly taskService: TaskService
  ) {}

  async handleDisconnect(client: Socket) {
    const binding = await this.deviceConnectionService.markDisconnected(client.id);
    if (binding?.clientType !== "desktop") {
      return;
    }

    const serverTime = new Date().toISOString();
    this.emitToClientType(binding.deviceId, "mobile", WS_EVENTS.DEVICE_ONLINE, {
      session: {
        deviceId: binding.deviceId,
        clientType: "desktop",
        status: "offline",
        deviceName: binding.deviceName,
        connectionId: client.id,
        registeredAt: serverTime,
        lastSeenAt: serverTime,
        metadata: {
          desktopId: binding.desktopId
        }
      },
      serverTime
    });
  }

  @SubscribeMessage(WS_EVENTS.DEVICE_REGISTER)
  async handleDeviceRegister(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    try {
      const response = await this.deviceConnectionService.register(client.id, payload);

      await client.join(
        DeviceConnectionService.roomName(response.session.deviceId, response.session.clientType)
      );
      const desktopId = this.getDesktopIdFromSession(response.session.metadata);
      if (response.session.clientType === "desktop" && desktopId) {
        await client.join(
          DeviceConnectionService.desktopTargetRoomName(response.session.deviceId, desktopId)
        );
      }

      client.emit(WS_EVENTS.DEVICE_ONLINE, response);
      if (response.session.clientType === "desktop") {
        this.emitToClientType(
          response.session.deviceId,
          "mobile",
          WS_EVENTS.DEVICE_ONLINE,
          response
        );
      }

      if (response.session.clientType === "mobile") {
        this.emitOnlineDesktopSessions(client, response.session.deviceId, response.serverTime);
      }

      return response;
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage(WS_EVENTS.TASK_CREATE)
  async handleTaskCreate(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    try {
      const binding = this.deviceConnectionService.requireSocketBinding(client.id, "mobile");
      const targetDesktopId = this.getTargetDesktopIdFromPayload(payload);
      const shouldPersist = await this.shouldPersist(binding.deviceId, targetDesktopId);
      const response = shouldPersist
        ? await this.taskService.createTask(payload, client.id)
        : this.taskService.createTransientTask(payload);

      if (response.task.createdByDeviceId !== binding.deviceId) {
        throw new WsException("task.create deviceId must match the registered mobile device");
      }

      this.emitToClientType(binding.deviceId, "mobile", WS_EVENTS.TASK_CREATED, response);
      await this.emitToDesktopTargetWithRetry({
        deviceId: binding.deviceId,
        targetDesktopId: response.task.assignedDesktopDeviceId,
        eventName: WS_EVENTS.TASK_CREATED,
        payload: response,
        taskId: response.task.id
      });

      return response;
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage(WS_EVENTS.TASK_STARTED)
  async handleTaskStarted(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.forwardDesktopEvent(client, async (binding) => {
      if (!(await this.shouldPersist(binding.deviceId, binding.desktopId))) {
        const relayPayload = this.taskService.toRelayTaskStarted(payload);
        this.emitToClientType(binding.deviceId, "mobile", WS_EVENTS.TASK_STARTED, relayPayload);
        return relayPayload;
      }

      const result = await this.taskService.markStarted(payload);
      this.emitToClientType(result.deviceId, "mobile", WS_EVENTS.TASK_STARTED, result.payload);
      return result.payload;
    });
  }

  @SubscribeMessage(WS_EVENTS.TASK_OUTPUT)
  async handleTaskOutput(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.forwardDesktopEvent(client, async (binding) => {
      if (!(await this.shouldPersist(binding.deviceId, binding.desktopId))) {
        const relayPayload = this.taskService.toRelayTaskOutput(payload);
        this.emitToClientType(binding.deviceId, "mobile", WS_EVENTS.TASK_OUTPUT, relayPayload);
        return relayPayload;
      }

      const result = await this.taskService.appendOutput(payload);
      this.emitToClientType(result.deviceId, "mobile", WS_EVENTS.TASK_OUTPUT, result.payload);
      return result.payload;
    });
  }

  @SubscribeMessage(WS_EVENTS.TASK_WAITING_APPROVAL)
  async handleTaskWaitingApproval(
    @MessageBody() payload: unknown,
    @ConnectedSocket() client: Socket
  ) {
    return this.forwardDesktopEvent(client, async (binding) => {
      if (!(await this.shouldPersist(binding.deviceId, binding.desktopId))) {
        const relayPayload = this.taskService.toRelayTaskWaitingApproval(payload);
        this.emitToClientType(
          binding.deviceId,
          "mobile",
          WS_EVENTS.TASK_WAITING_APPROVAL,
          relayPayload
        );
        return relayPayload;
      }

      const result = await this.taskService.markWaitingApproval(payload);
      this.emitToClientType(
        result.deviceId,
        "mobile",
        WS_EVENTS.TASK_WAITING_APPROVAL,
        result.payload
      );
      return result.payload;
    });
  }

  @SubscribeMessage(WS_EVENTS.TASK_APPROVAL_SUBMIT)
  async handleTaskApprovalSubmit(
    @MessageBody() payload: unknown,
    @ConnectedSocket() client: Socket
  ) {
    try {
      const binding = this.deviceConnectionService.requireSocketBinding(client.id, "mobile");
      const targetDesktopIdFromPayload = this.getTargetDesktopIdFromPayload(payload);
      const shouldPersist = await this.shouldPersist(binding.deviceId, targetDesktopIdFromPayload);
      const result = shouldPersist
        ? await this.taskService.submitApproval(payload)
        : {
            deviceId: binding.deviceId,
            ...this.taskService.toRelayApproval(payload)
          };

      if (result.submitPayload.deviceId !== binding.deviceId) {
        throw new WsException("task approval deviceId must match registered mobile device");
      }

      if (binding.deviceId !== result.deviceId) {
        throw new WsException("task approval deviceId does not match registered mobile device");
      }

      const targetDesktopId = shouldPersist
        ? (await this.taskService.getTaskTargetDesktopId(result.submitPayload.taskId)) ??
          result.submitPayload.targetDesktopId
        : result.submitPayload.targetDesktopId;

      const delivered = await this.emitToDesktopTargetWithRetry({
        deviceId: result.deviceId,
        targetDesktopId,
        eventName: WS_EVENTS.TASK_APPROVAL_SUBMIT,
        payload: result.submitPayload,
        taskId: result.submitPayload.taskId
      });
      if (delivered) {
        this.emitToClientType(
          result.deviceId,
          "mobile",
          WS_EVENTS.TASK_APPROVAL_RESULT,
          result.resultPayload
        );
      }

      return result.resultPayload;
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage(WS_EVENTS.TASK_COMPLETED)
  async handleTaskCompleted(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.forwardDesktopEvent(client, async (binding) => {
      if (!(await this.shouldPersist(binding.deviceId, binding.desktopId))) {
        const relayPayload = this.taskService.toRelayTaskCompleted(payload);
        this.emitToClientType(binding.deviceId, "mobile", WS_EVENTS.TASK_COMPLETED, relayPayload);
        return relayPayload;
      }

      const result = await this.taskService.markCompleted(payload);
      this.emitToClientType(result.deviceId, "mobile", WS_EVENTS.TASK_COMPLETED, result.payload);
      return result.payload;
    });
  }

  @SubscribeMessage(WS_EVENTS.TASK_FAILED)
  async handleTaskFailed(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.forwardDesktopEvent(client, async (binding) => {
      if (!(await this.shouldPersist(binding.deviceId, binding.desktopId))) {
        const relayPayload = this.taskService.toRelayTaskFailed(payload);
        this.emitToClientType(binding.deviceId, "mobile", WS_EVENTS.TASK_FAILED, relayPayload);
        return relayPayload;
      }

      const result = await this.taskService.markFailed(payload);
      this.emitToClientType(result.deviceId, "mobile", WS_EVENTS.TASK_FAILED, result.payload);
      return result.payload;
    });
  }

  @SubscribeMessage(WS_EVENTS.TASK_CANCEL)
  async handleTaskCancel(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    try {
      const binding = this.deviceConnectionService.requireSocketBinding(client.id);
      const targetDesktopIdFromPayload =
        this.getTargetDesktopIdFromPayload(payload) ??
        (binding.clientType === "desktop" ? binding.desktopId : undefined);
      if (!(await this.shouldPersist(binding.deviceId, targetDesktopIdFromPayload))) {
        const relayPayload = this.taskService.toRelayTaskCancel(payload);
        if (relayPayload.deviceId !== binding.deviceId) {
          throw new WsException("task.cancel deviceId must match the registered device");
        }

        const delivered = await this.emitToDesktopTargetWithRetry({
          deviceId: binding.deviceId,
          targetDesktopId: relayPayload.targetDesktopId,
          eventName: WS_EVENTS.TASK_CANCEL,
          payload: relayPayload,
          taskId: relayPayload.taskId
        });
        if (delivered) {
          this.emitToClientType(binding.deviceId, "mobile", WS_EVENTS.TASK_CANCEL, relayPayload);
        }
        return relayPayload;
      }

      const result = await this.taskService.cancelTask(payload);

      const targetDesktopId =
        (await this.taskService.getTaskTargetDesktopId(result.payload.taskId)) ??
        result.payload.targetDesktopId;
      const delivered = await this.emitToDesktopTargetWithRetry({
        deviceId: result.deviceId,
        targetDesktopId,
        eventName: WS_EVENTS.TASK_CANCEL,
        payload: result.payload,
        taskId: result.payload.taskId
      });
      if (delivered) {
        this.emitToClientType(result.deviceId, "mobile", WS_EVENTS.TASK_CANCEL, result.payload);
      }

      return result.payload;
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  private async forwardDesktopEvent<Payload>(
    client: Socket,
    handler: (binding: SocketBinding) => Promise<Payload>
  ): Promise<Payload> {
    try {
      const binding = this.deviceConnectionService.requireSocketBinding(client.id, "desktop");
      return await handler(binding);
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  private async shouldPersist(deviceId: string, desktopId?: string) {
    return (
      (await this.deviceConnectionService.getServerPersistenceMode(deviceId, desktopId)) ===
      "persist"
    );
  }

  private emitToClientType<EventName extends ServerToClientEventName>(
    deviceId: string,
    clientType: ClientType,
    eventName: EventName,
    payload: ServerToClientEventPayloads[EventName]
  ) {
    this.server
      .to(DeviceConnectionService.roomName(deviceId, clientType))
      .emit(eventName, payload);
  }

  private emitToDesktopTarget<EventName extends ServerToClientEventName>(
    deviceId: string,
    targetDesktopId: string | undefined,
    eventName: EventName,
    payload: ServerToClientEventPayloads[EventName]
  ) {
    if (!targetDesktopId) {
      this.emitToClientType(deviceId, "desktop", eventName, payload);
      return;
    }

    this.server
      .to(DeviceConnectionService.desktopTargetRoomName(deviceId, targetDesktopId))
      .emit(eventName, payload);
  }

  private async emitToDesktopTargetWithRetry<EventName extends ServerToClientEventName>(input: {
    deviceId: string;
    targetDesktopId?: string;
    eventName: EventName;
    payload: ServerToClientEventPayloads[EventName];
    taskId?: string;
  }) {
    for (let attempt = 1; attempt <= this.relayRetryAttempts; attempt += 1) {
      if (this.hasDesktopTarget(input.deviceId, input.targetDesktopId)) {
        this.emitToDesktopTarget(
          input.deviceId,
          input.targetDesktopId,
          input.eventName,
          input.payload
        );
        return true;
      }

      if (attempt < this.relayRetryAttempts) {
        await delay(this.relayRetryDelayMs);
      }
    }

    const targetDescription = input.targetDesktopId
      ? `desktop ${input.targetDesktopId}`
      : "any desktop";
    this.emitToClientType(input.deviceId, "mobile", WS_EVENTS.TASK_RELAY_FAILED, {
      taskId: input.taskId,
      deviceId: input.deviceId,
      targetDesktopId: input.targetDesktopId,
      failedEventName: input.eventName,
      attempts: this.relayRetryAttempts,
      error: {
        code: "RELAY_TARGET_OFFLINE",
        message: `Unable to relay ${input.eventName} to ${targetDescription}: desktop is not connected`
      },
      createdAt: new Date().toISOString()
    });

    return false;
  }

  private hasDesktopTarget(deviceId: string, targetDesktopId: string | undefined) {
    const desktops = this.deviceConnectionService.listDesktopBindings(deviceId);
    if (!targetDesktopId) {
      return desktops.length > 0;
    }

    return desktops.some((desktop) => desktop.desktopId === targetDesktopId);
  }

  private emitOnlineDesktopSessions(client: Socket, deviceId: string, serverTime: string) {
    for (const desktop of this.deviceConnectionService.listDesktopBindings(deviceId)) {
      if (!desktop.desktopId) {
        continue;
      }

      client.emit(WS_EVENTS.DEVICE_ONLINE, {
        session: {
          deviceId: desktop.deviceId,
          clientType: "desktop",
          status: "online",
          deviceName: desktop.deviceName,
          connectionId: desktop.connectionId,
          registeredAt: serverTime,
          lastSeenAt: serverTime,
          metadata: {
            desktopId: desktop.desktopId
          }
        },
        serverTime
      });
    }
  }

  private getDesktopIdFromSession(metadata: Record<string, unknown> | undefined) {
    const desktopId = metadata?.desktopId;
    return typeof desktopId === "string" && desktopId.trim() ? desktopId : undefined;
  }

  private getTargetDesktopIdFromPayload(payload: unknown) {
    if (!payload || typeof payload !== "object") {
      return undefined;
    }

    const targetDesktopId = (payload as { targetDesktopId?: unknown }).targetDesktopId;
    return typeof targetDesktopId === "string" && targetDesktopId.trim()
      ? targetDesktopId.trim()
      : undefined;
  }

  private toWsException(error: unknown) {
    if (error instanceof WsException) {
      return error;
    }

    if (error instanceof Error) {
      return new WsException(error.message);
    }

    return new WsException("Unexpected WebSocket error");
  }
}

function delay(milliseconds: number) {
  if (milliseconds <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
