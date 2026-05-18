import type {
  AgentTask,
  ApprovalDecision,
  ApprovalRequest,
  DesktopBindingFailedPayload,
  DesktopBindingConfirmPayload,
  DeviceOnlinePayload,
  OutputChunk,
  ServerToClientEventPayloads,
  TaskApprovalResultPayload,
  TaskCancelPayload,
  TaskCompletedPayload,
  TaskCreatedPayload,
  TaskFailedPayload,
  TaskOutputPayload,
  TaskRelayFailedPayload,
  TaskStartedPayload,
  TaskWaitingApprovalPayload
} from "@personal-ai-assistant/shared";
import { WS_EVENTS, WS_NAMESPACE } from "@personal-ai-assistant/shared";
import { io, type Socket } from "socket.io-client";

export type MobileConnectionStatus = "idle" | "connecting" | "connected" | "disconnected";

export interface MobileWebSocketHandlers {
  onConnectionStatus: (status: MobileConnectionStatus) => void;
  onError: (message: string) => void;
  onDeviceOnline: (payload: DeviceOnlinePayload) => void;
  onTask: (task: AgentTask) => void;
  onOutput: (chunk: OutputChunk) => void;
  onApproval: (approval: ApprovalRequest) => void;
  onApprovalResult: (result: TaskApprovalResultPayload) => void;
  onDesktopBindingConfirmed: (payload: DesktopBindingConfirmPayload) => void;
  onDesktopBindingFailed: (payload: DesktopBindingFailedPayload) => void;
  onRelayFailed: (failure: TaskRelayFailedPayload) => void;
}

export interface MobileConnectOptions {
  serverUrl: string;
  deviceId: string;
  handlers: MobileWebSocketHandlers;
}

export interface CreateTaskInput {
  deviceId: string;
  targetDesktopId?: string;
  requestId?: string;
  workspacePath: string;
  prompt: string;
}

export interface SubmitApprovalInput {
  taskId: string;
  approvalRequestId: string;
  targetDesktopId?: string;
  decision: ApprovalDecision;
  reason?: string;
}

export class MobileWebSocketClient {
  private socket?: Socket;
  private handlers?: MobileWebSocketHandlers;
  private deviceId?: string;

  connect(options: MobileConnectOptions) {
    this.disconnect();
    this.handlers = options.handlers;
    this.deviceId = options.deviceId;
    this.handlers.onConnectionStatus("connecting");

    const socket = io(this.namespaceUrl(options.serverUrl), {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000
    });

    this.socket = socket;
    this.registerHandlers(socket);
    socket.connect();
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = undefined;
  }

  createTask(input: CreateTaskInput) {
    this.requireSocket().emit(WS_EVENTS.TASK_CREATE, {
      deviceId: input.deviceId,
      targetDesktopId: input.targetDesktopId,
      requestId: input.requestId,
      prompt: input.prompt,
      metadata: {
        workspacePath: input.workspacePath
      }
    });
  }

  cancelTask(taskId: string, targetDesktopId?: string) {
    const deviceId = this.deviceId;
    if (!deviceId) {
      throw new Error("Connect before cancelling a task");
    }

    this.requireSocket().emit(WS_EVENTS.TASK_CANCEL, {
      taskId,
      deviceId,
      targetDesktopId,
      reason: "Cancelled from mobile"
    });
  }

  submitApproval(input: SubmitApprovalInput) {
    const deviceId = this.deviceId;
    if (!deviceId) {
      throw new Error("Connect before submitting approval");
    }

    this.requireSocket().emit(WS_EVENTS.TASK_APPROVAL_SUBMIT, {
      taskId: input.taskId,
      approvalRequestId: input.approvalRequestId,
      deviceId,
      targetDesktopId: input.targetDesktopId,
      decision: input.decision,
      reason: input.reason
    });
  }

  confirmDesktopBinding(input: DesktopBindingConfirmPayload) {
    this.requireSocket().emit(WS_EVENTS.DESKTOP_BINDING_CONFIRM, input);
  }

  private registerHandlers(socket: Socket) {
    socket.on("connect", () => {
      const deviceId = this.deviceId;
      if (!deviceId) {
        this.handlers?.onError("deviceId is required before connecting");
        return;
      }

      socket.emit(WS_EVENTS.DEVICE_REGISTER, {
        deviceId,
        clientType: "mobile"
      });
      this.handlers?.onConnectionStatus("connected");
    });

    socket.on("disconnect", () => {
      this.handlers?.onConnectionStatus("disconnected");
    });

    socket.on("connect_error", (error) => {
      this.handlers?.onError(error.message);
      this.handlers?.onConnectionStatus("disconnected");
    });

    socket.on("error", (error) => {
      this.handlers?.onError(typeof error === "string" ? error : "WebSocket error");
    });

    socket.on(WS_EVENTS.DEVICE_ONLINE, (payload: DeviceOnlinePayload) => {
      this.handlers?.onDeviceOnline(payload);
    });

    socket.on(WS_EVENTS.TASK_CREATED, (payload: TaskCreatedPayload) => {
      this.handlers?.onTask(payload.task);
    });

    socket.on(WS_EVENTS.TASK_STARTED, (payload: TaskStartedPayload) => {
      this.handlers?.onTask({
        ...payload.task,
        status: "running"
      });
    });

    socket.on(WS_EVENTS.TASK_OUTPUT, (payload: TaskOutputPayload) => {
      this.handlers?.onOutput(payload.chunk);
    });

    socket.on(WS_EVENTS.TASK_WAITING_APPROVAL, (payload: TaskWaitingApprovalPayload) => {
      this.handlers?.onTask(payload.task);
      this.handlers?.onApproval(payload.approval);
    });

    socket.on(WS_EVENTS.TASK_APPROVAL_RESULT, (payload: TaskApprovalResultPayload) => {
      this.handlers?.onApprovalResult(payload);
    });

    socket.on(WS_EVENTS.DESKTOP_BINDING_CONFIRMED, (payload: DesktopBindingConfirmPayload) => {
      this.handlers?.onDesktopBindingConfirmed(payload);
    });

    socket.on(WS_EVENTS.DESKTOP_BINDING_FAILED, (payload: DesktopBindingFailedPayload) => {
      this.handlers?.onDesktopBindingFailed(payload);
    });

    socket.on(WS_EVENTS.TASK_COMPLETED, (payload: TaskCompletedPayload) => {
      this.handlers?.onTask(payload.task);
    });

    socket.on(WS_EVENTS.TASK_FAILED, (payload: TaskFailedPayload) => {
      this.handlers?.onTask(payload.task);
    });

    socket.on(WS_EVENTS.TASK_RELAY_FAILED, (payload: TaskRelayFailedPayload) => {
      this.handlers?.onRelayFailed(payload);
    });

    socket.on(WS_EVENTS.TASK_CANCEL, (payload: TaskCancelPayload) => {
      this.handlers?.onTask({
        id: payload.taskId,
        prompt: "",
        status: "cancelled",
        createdByDeviceId: payload.deviceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });
  }

  private namespaceUrl(serverUrl: string) {
    const normalized = serverUrl.trim().replace(/\/$/, "");
    return normalized.endsWith(WS_NAMESPACE) ? normalized : `${normalized}${WS_NAMESPACE}`;
  }

  private requireSocket() {
    if (!this.socket || !this.socket.connected) {
      throw new Error("WebSocket is not connected");
    }

    return this.socket;
  }
}

export type ServerEventPayload = ServerToClientEventPayloads[keyof ServerToClientEventPayloads];
