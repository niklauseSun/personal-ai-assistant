import type {
  ClientToServerEventPayloads,
  DeviceOnlinePayload,
  TaskApprovalSubmitPayload,
  TaskCancelPayload,
  TaskCompletedPayload,
  TaskCreatedPayload,
  TaskFailedPayload,
  TaskOutputPayload,
  TaskStartedPayload,
  TaskWaitingApprovalPayload
} from "@personal-ai-assistant/shared";
import { WS_EVENTS, WS_NAMESPACE } from "@personal-ai-assistant/shared";
import { io, type Socket } from "socket.io-client";
import { Logger } from "./logger";

export interface DesktopWebSocketClientOptions {
  serverUrl: string;
  deviceId: string;
  deviceName?: string;
  clientVersion?: string;
  logger?: Logger;
}

type TaskCreatedHandler = (payload: TaskCreatedPayload) => void;
type TaskCancelHandler = (payload: TaskCancelPayload) => void;
type ApprovalSubmitHandler = (payload: TaskApprovalSubmitPayload) => void;
type DeviceOnlineHandler = (payload: DeviceOnlinePayload) => void;

export class DesktopWebSocketClient {
  private readonly logger: Logger;
  private readonly socket: Socket;
  private taskCreatedHandler?: TaskCreatedHandler;
  private taskCancelHandler?: TaskCancelHandler;
  private approvalSubmitHandler?: ApprovalSubmitHandler;
  private deviceOnlineHandler?: DeviceOnlineHandler;

  constructor(private readonly options: DesktopWebSocketClientOptions) {
    this.logger = options.logger ?? new Logger("websocket");
    this.socket = io(this.namespaceUrl(options.serverUrl), {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000
    });

    this.registerSocketHandlers();
  }

  connect() {
    this.logger.info("connecting to server", {
      serverUrl: this.options.serverUrl,
      deviceId: this.options.deviceId
    });
    this.socket.connect();
  }

  disconnect() {
    this.socket.disconnect();
  }

  onTaskCreated(handler: TaskCreatedHandler) {
    this.taskCreatedHandler = handler;
  }

  onTaskCancel(handler: TaskCancelHandler) {
    this.taskCancelHandler = handler;
  }

  onApprovalSubmit(handler: ApprovalSubmitHandler) {
    this.approvalSubmitHandler = handler;
  }

  onDeviceOnline(handler: DeviceOnlineHandler) {
    this.deviceOnlineHandler = handler;
  }

  sendTaskStarted(payload: TaskStartedPayload) {
    this.emit(WS_EVENTS.TASK_STARTED, payload);
  }

  sendTaskOutput(payload: TaskOutputPayload) {
    this.emit(WS_EVENTS.TASK_OUTPUT, payload);
  }

  sendTaskCompleted(payload: TaskCompletedPayload) {
    this.emit(WS_EVENTS.TASK_COMPLETED, payload);
  }

  sendTaskFailed(payload: TaskFailedPayload) {
    this.emit(WS_EVENTS.TASK_FAILED, payload);
  }

  sendTaskWaitingApproval(payload: TaskWaitingApprovalPayload) {
    this.emit(WS_EVENTS.TASK_WAITING_APPROVAL, payload);
  }

  private registerSocketHandlers() {
    this.socket.on("connect", () => {
      this.logger.info("connected", {
        socketId: this.socket.id
      });

      this.socket.emit(WS_EVENTS.DEVICE_REGISTER, {
        deviceId: this.options.deviceId,
        clientType: "desktop",
        deviceName: this.options.deviceName,
        clientVersion: this.options.clientVersion
      });
    });

    this.socket.on("disconnect", (reason) => {
      this.logger.warn("disconnected", {
        reason
      });
    });

    this.socket.on("connect_error", (error) => {
      this.logger.error("connection failed", {
        message: error.message
      });
    });

    this.socket.on(WS_EVENTS.DEVICE_ONLINE, (payload: DeviceOnlinePayload) => {
      this.logger.info("device registered", {
        deviceId: payload.session.deviceId,
        clientType: payload.session.clientType,
        serverTime: payload.serverTime
      });
      this.deviceOnlineHandler?.(payload);
    });

    this.socket.on(WS_EVENTS.TASK_CREATED, (payload: TaskCreatedPayload) => {
      this.logger.info("received task assignment", {
        taskId: payload.task.id
      });
      this.taskCreatedHandler?.(payload);
    });

    this.socket.on(WS_EVENTS.TASK_CREATE, (payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        "task" in payload &&
        payload.task &&
        typeof payload.task === "object" &&
        "id" in payload.task
      ) {
        const taskPayload = payload as TaskCreatedPayload;
        this.logger.info("received task.create assignment alias", {
          taskId: taskPayload.task.id
        });
        this.taskCreatedHandler?.(taskPayload);
        return;
      }

      this.logger.warn("ignored task.create without task assignment payload");
    });

    this.socket.on(WS_EVENTS.TASK_CANCEL, (payload: TaskCancelPayload) => {
      this.logger.warn("received task cancellation", {
        taskId: payload.taskId
      });
      this.taskCancelHandler?.(payload);
    });

    this.socket.on(WS_EVENTS.TASK_APPROVAL_SUBMIT, (payload: TaskApprovalSubmitPayload) => {
      this.logger.info("received approval decision", {
        taskId: payload.taskId,
        approvalRequestId: payload.approvalRequestId,
        decision: payload.decision
      });
      this.approvalSubmitHandler?.(payload);
    });
  }

  private emit<EventName extends keyof ClientToServerEventPayloads>(
    eventName: EventName,
    payload: ClientToServerEventPayloads[EventName]
  ) {
    this.logger.info("sending event", {
      eventName,
      taskId: this.getTaskId(payload)
    });
    this.socket.emit(eventName, payload);
  }

  private namespaceUrl(serverUrl: string) {
    const normalized = serverUrl.replace(/\/$/, "");
    return normalized.endsWith(WS_NAMESPACE) ? normalized : `${normalized}${WS_NAMESPACE}`;
  }

  private getTaskId(payload: ClientToServerEventPayloads[keyof ClientToServerEventPayloads]) {
    if ("taskId" in payload && typeof payload.taskId === "string") {
      return payload.taskId;
    }

    if ("task" in payload && payload.task && typeof payload.task.id === "string") {
      return payload.task.id;
    }

    return undefined;
  }
}
