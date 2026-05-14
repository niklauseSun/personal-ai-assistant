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
import { DeviceConnectionService } from "../devices/device-connection.service";
import { TaskService } from "../tasks/task.service";

@WebSocketGateway({
  namespace: WS_NAMESPACE,
  cors: {
    origin: "*"
  }
})
export class AgentGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  constructor(
    @Inject(DeviceConnectionService)
    private readonly deviceConnectionService: DeviceConnectionService,
    @Inject(TaskService)
    private readonly taskService: TaskService
  ) {}

  async handleDisconnect(client: Socket) {
    await this.deviceConnectionService.markDisconnected(client.id);
  }

  @SubscribeMessage(WS_EVENTS.DEVICE_REGISTER)
  async handleDeviceRegister(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    try {
      const response = await this.deviceConnectionService.register(client.id, payload);

      await client.join(
        DeviceConnectionService.roomName(response.session.deviceId, response.session.clientType)
      );
      client.emit(WS_EVENTS.DEVICE_ONLINE, response);

      return response;
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage(WS_EVENTS.TASK_CREATE)
  async handleTaskCreate(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    try {
      const binding = this.deviceConnectionService.requireSocketBinding(client.id, "mobile");
      const response = await this.taskService.createTask(payload, client.id);

      if (response.task.createdByDeviceId !== binding.deviceId) {
        throw new WsException("task.create deviceId must match the registered mobile device");
      }

      this.emitToClientType(binding.deviceId, "mobile", WS_EVENTS.TASK_CREATED, response);
      this.emitToClientType(binding.deviceId, "desktop", WS_EVENTS.TASK_CREATED, response);

      return response;
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage(WS_EVENTS.TASK_STARTED)
  async handleTaskStarted(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.forwardDesktopEvent(client, async () => {
      const result = await this.taskService.markStarted(payload);
      this.emitToClientType(result.deviceId, "mobile", WS_EVENTS.TASK_STARTED, result.payload);
      return result.payload;
    });
  }

  @SubscribeMessage(WS_EVENTS.TASK_OUTPUT)
  async handleTaskOutput(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.forwardDesktopEvent(client, async () => {
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
    return this.forwardDesktopEvent(client, async () => {
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
      const result = await this.taskService.submitApproval(payload);

      if (binding.deviceId !== result.deviceId) {
        throw new WsException("task approval deviceId does not match registered mobile device");
      }

      this.emitToClientType(
        result.deviceId,
        "desktop",
        WS_EVENTS.TASK_APPROVAL_SUBMIT,
        result.submitPayload
      );
      this.emitToClientType(
        result.deviceId,
        "mobile",
        WS_EVENTS.TASK_APPROVAL_RESULT,
        result.resultPayload
      );

      return result.resultPayload;
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage(WS_EVENTS.TASK_COMPLETED)
  async handleTaskCompleted(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.forwardDesktopEvent(client, async () => {
      const result = await this.taskService.markCompleted(payload);
      this.emitToClientType(result.deviceId, "mobile", WS_EVENTS.TASK_COMPLETED, result.payload);
      return result.payload;
    });
  }

  @SubscribeMessage(WS_EVENTS.TASK_FAILED)
  async handleTaskFailed(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.forwardDesktopEvent(client, async () => {
      const result = await this.taskService.markFailed(payload);
      this.emitToClientType(result.deviceId, "mobile", WS_EVENTS.TASK_FAILED, result.payload);
      return result.payload;
    });
  }

  @SubscribeMessage(WS_EVENTS.TASK_CANCEL)
  async handleTaskCancel(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    try {
      this.deviceConnectionService.requireSocketBinding(client.id);
      const result = await this.taskService.cancelTask(payload);

      this.emitToClientType(result.deviceId, "desktop", WS_EVENTS.TASK_CANCEL, result.payload);
      this.emitToClientType(result.deviceId, "mobile", WS_EVENTS.TASK_CANCEL, result.payload);

      return result.payload;
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  private async forwardDesktopEvent<Payload>(
    client: Socket,
    handler: () => Promise<Payload>
  ): Promise<Payload> {
    try {
      this.deviceConnectionService.requireSocketBinding(client.id, "desktop");
      return await handler();
    } catch (error) {
      throw this.toWsException(error);
    }
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
