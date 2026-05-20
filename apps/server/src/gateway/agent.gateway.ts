import { Inject, Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException
} from "@nestjs/websockets";
import type {
  ClientType,
  DesktopBindingFailedPayload,
  DesktopBindingConfirmPayload,
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
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AgentGateway.name);
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

  handleConnection(client: Socket) {
    this.logger.log(
      `socket connected id=${client.id} address=${client.handshake.address} transport=${client.conn.transport.name}`
    );
  }

  async handleDisconnect(client: Socket) {
    const binding = await this.deviceConnectionService.markDisconnected(client.id);
    this.logger.log(
      `socket disconnected id=${client.id} clientType=${binding?.clientType ?? "unregistered"} deviceId=${binding?.deviceId ?? "unknown"}`
    );
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
        clientVersion: binding.clientVersion,
        connectionId: client.id,
        registeredAt: binding.registeredAt,
        lastSeenAt: binding.lastSeenAt,
        metadata: binding.metadata
      },
      serverTime
    });
  }

  @SubscribeMessage(WS_EVENTS.DEVICE_REGISTER)
  async handleDeviceRegister(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    try {
      const response = await this.deviceConnectionService.register(client.id, payload);
      this.logger.log(
        `device registered socket=${client.id} clientType=${response.session.clientType} deviceId=${response.session.deviceId} desktopId=${this.getDesktopIdFromSession(response.session.metadata) ?? "none"}`
      );

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

  @SubscribeMessage(WS_EVENTS.DEVICE_HEARTBEAT)
  async handleDeviceHeartbeat(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    try {
      const response = await this.deviceConnectionService.heartbeat(client.id, payload);
      this.emitToClientType(
        response.session.deviceId,
        "mobile",
        WS_EVENTS.DEVICE_ONLINE,
        response
      );
      return response;
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage(WS_EVENTS.DESKTOP_BINDING_CONFIRM)
  async handleDesktopBindingConfirm(
    @MessageBody() payload: unknown,
    @ConnectedSocket() client: Socket
  ) {
    try {
      const binding = this.deviceConnectionService.requireSocketBinding(client.id, "mobile");
      const confirmPayload = this.toDesktopBindingConfirmPayload(payload);

      if (confirmPayload.deviceId !== binding.deviceId) {
        throw new WsException("desktop binding deviceId must match the registered mobile device");
      }

      await this.emitToDesktopTargetWithRetry({
        deviceId: binding.deviceId,
        targetDesktopId: confirmPayload.desktopId,
        eventName: WS_EVENTS.DESKTOP_BINDING_CONFIRM,
        payload: confirmPayload
      });

      return confirmPayload;
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage(WS_EVENTS.DESKTOP_BINDING_CONFIRMED)
  async handleDesktopBindingConfirmed(
    @MessageBody() payload: unknown,
    @ConnectedSocket() client: Socket
  ) {
    try {
      const binding = this.deviceConnectionService.requireSocketBinding(client.id, "desktop");
      const confirmPayload = this.toDesktopBindingConfirmPayload(payload);
      this.assertDesktopBindingMatches(binding, confirmPayload.deviceId, confirmPayload.desktopId);

      this.emitToClientType(
        binding.deviceId,
        "mobile",
        WS_EVENTS.DESKTOP_BINDING_CONFIRMED,
        confirmPayload
      );

      return confirmPayload;
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage(WS_EVENTS.DESKTOP_BINDING_FAILED)
  async handleDesktopBindingFailed(
    @MessageBody() payload: unknown,
    @ConnectedSocket() client: Socket
  ) {
    try {
      const binding = this.deviceConnectionService.requireSocketBinding(client.id, "desktop");
      const failedPayload = this.toDesktopBindingFailedPayload(payload);
      this.assertDesktopBindingMatches(binding, failedPayload.deviceId, failedPayload.desktopId);

      this.emitToClientType(
        binding.deviceId,
        "mobile",
        WS_EVENTS.DESKTOP_BINDING_FAILED,
        failedPayload
      );

      return failedPayload;
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
          clientVersion: desktop.clientVersion,
          connectionId: desktop.connectionId,
          registeredAt: desktop.registeredAt,
          lastSeenAt: desktop.lastSeenAt,
          metadata: desktop.metadata
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

  private toDesktopBindingConfirmPayload(payload: unknown): DesktopBindingConfirmPayload {
    if (!payload || typeof payload !== "object") {
      throw new WsException("desktop binding confirmation payload is required");
    }

    const record = payload as Record<string, unknown>;
    const deviceId = this.requiredString(record.deviceId, "deviceId");
    const desktopId = this.requiredString(record.desktopId, "desktopId");
    const desktopName = this.requiredString(record.desktopName, "desktopName");
    const pairingCode = this.requiredPairingCode(record.pairingCode);
    const mobileDevice = this.toMobileDeviceInfo(record.mobileDevice);
    const confirmedAt = this.requiredString(record.confirmedAt, "confirmedAt");

    return {
      deviceId,
      desktopId,
      desktopName,
      pairingCode,
      mobileDevice,
      confirmedAt
    };
  }

  private toDesktopBindingFailedPayload(payload: unknown): DesktopBindingFailedPayload {
    if (!payload || typeof payload !== "object") {
      throw new WsException("desktop binding failure payload is required");
    }

    const record = payload as Record<string, unknown>;
    return {
      deviceId: this.requiredString(record.deviceId, "deviceId"),
      desktopId: this.requiredString(record.desktopId, "desktopId"),
      reason: this.requiredString(record.reason, "reason"),
      rejectedAt: this.requiredString(record.rejectedAt, "rejectedAt")
    };
  }

  private assertDesktopBindingMatches(binding: SocketBinding, deviceId: string, desktopId: string) {
    if (deviceId !== binding.deviceId) {
      throw new WsException("desktop binding deviceId must match the registered desktop device");
    }

    if (desktopId !== binding.desktopId) {
      throw new WsException("desktop binding desktopId must match the registered desktop");
    }
  }

  private toMobileDeviceInfo(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new WsException("desktop binding mobileDevice must be an object");
    }

    const record = value as Record<string, unknown>;
    return {
      deviceName: this.optionalString(record.deviceName, "mobileDevice.deviceName"),
      modelName: this.optionalString(record.modelName, "mobileDevice.modelName"),
      manufacturer: this.optionalString(record.manufacturer, "mobileDevice.manufacturer"),
      osName: this.optionalString(record.osName, "mobileDevice.osName"),
      osVersion: this.optionalString(record.osVersion, "mobileDevice.osVersion"),
      platform: this.optionalString(record.platform, "mobileDevice.platform")
    };
  }

  private requiredPairingCode(value: unknown) {
    const code = this.requiredString(value, "pairingCode");
    if (!/^\d{6}$/.test(code)) {
      throw new WsException("desktop binding pairingCode must be exactly 6 digits");
    }

    return code;
  }

  private optionalString(value: unknown, fieldName: string) {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === "string") {
      return value.trim() || undefined;
    }

    throw new WsException(`desktop binding ${fieldName} must be a string`);
  }

  private requiredString(value: unknown, fieldName: string) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    throw new WsException(`desktop binding ${fieldName} must be a string`);
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
