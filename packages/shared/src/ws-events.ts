import type {
  AgentTask,
  ApprovalDecision,
  ApprovalRequest,
  ApprovalStatus,
  ClientType,
  DeviceSession,
  Id,
  OutputChunk,
  SharedError
} from "./models";

export const WS_NAMESPACE = "/tasks";

export const WS_EVENTS = {
  DEVICE_REGISTER: "device.register",
  DEVICE_ONLINE: "device.online",
  TASK_CREATE: "task.create",
  TASK_CREATED: "task.created",
  TASK_STARTED: "task.started",
  TASK_OUTPUT: "task.output",
  TASK_WAITING_APPROVAL: "task.waiting_approval",
  TASK_APPROVAL_SUBMIT: "task.approval.submit",
  TASK_APPROVAL_RESULT: "task.approval.result",
  TASK_COMPLETED: "task.completed",
  TASK_FAILED: "task.failed",
  TASK_CANCEL: "task.cancel",
  TASK_RELAY_FAILED: "task.relay_failed"
} as const;

export const WS_EVENT_NAMES = [
  WS_EVENTS.DEVICE_REGISTER,
  WS_EVENTS.DEVICE_ONLINE,
  WS_EVENTS.TASK_CREATE,
  WS_EVENTS.TASK_CREATED,
  WS_EVENTS.TASK_STARTED,
  WS_EVENTS.TASK_OUTPUT,
  WS_EVENTS.TASK_WAITING_APPROVAL,
  WS_EVENTS.TASK_APPROVAL_SUBMIT,
  WS_EVENTS.TASK_APPROVAL_RESULT,
  WS_EVENTS.TASK_COMPLETED,
  WS_EVENTS.TASK_FAILED,
  WS_EVENTS.TASK_CANCEL,
  WS_EVENTS.TASK_RELAY_FAILED
] as const;

export type WsEventName = (typeof WS_EVENT_NAMES)[number];

export interface DeviceRegisterPayload {
  deviceId: Id;
  clientType: ClientType;
  deviceName?: string;
  clientVersion?: string;
  metadata?: Record<string, unknown>;
}

export interface DeviceOnlinePayload {
  session: DeviceSession;
  serverTime: string;
}

export interface TaskCreatePayload {
  deviceId: Id;
  targetDesktopId?: Id;
  prompt: string;
  requestId?: Id;
  metadata?: Record<string, unknown>;
}

export interface TaskCreatedPayload {
  task: AgentTask;
}

export interface TaskStartedPayload {
  task: AgentTask;
  startedAt: string;
}

export interface TaskOutputPayload {
  taskId: Id;
  chunk: OutputChunk;
}

export interface TaskWaitingApprovalPayload {
  task: AgentTask;
  approval: ApprovalRequest;
}

export interface TaskApprovalSubmitPayload {
  taskId: Id;
  approvalRequestId: Id;
  deviceId: Id;
  targetDesktopId?: Id;
  decision: ApprovalDecision;
  reason?: string;
}

export interface TaskApprovalResultPayload {
  taskId: Id;
  approvalRequestId: Id;
  status: ApprovalStatus;
  decision: ApprovalDecision;
  resolvedByDeviceId: Id;
  resolvedAt: string;
  reason?: string;
}

export interface TaskCompletedPayload {
  task: AgentTask;
  exitCode?: number;
}

export interface TaskFailedPayload {
  task: AgentTask;
  error: SharedError;
  exitCode?: number;
}

export interface TaskCancelPayload {
  taskId: Id;
  deviceId: Id;
  targetDesktopId?: Id;
  reason?: string;
}

export interface TaskRelayFailedPayload {
  taskId?: Id;
  deviceId: Id;
  targetDesktopId?: Id;
  failedEventName: string;
  attempts: number;
  error: SharedError;
  createdAt: string;
}

export interface ClientToServerEventPayloads {
  [WS_EVENTS.DEVICE_REGISTER]: DeviceRegisterPayload;
  [WS_EVENTS.TASK_CREATE]: TaskCreatePayload;
  [WS_EVENTS.TASK_STARTED]: TaskStartedPayload;
  [WS_EVENTS.TASK_OUTPUT]: TaskOutputPayload;
  [WS_EVENTS.TASK_WAITING_APPROVAL]: TaskWaitingApprovalPayload;
  [WS_EVENTS.TASK_APPROVAL_SUBMIT]: TaskApprovalSubmitPayload;
  [WS_EVENTS.TASK_COMPLETED]: TaskCompletedPayload;
  [WS_EVENTS.TASK_FAILED]: TaskFailedPayload;
  [WS_EVENTS.TASK_CANCEL]: TaskCancelPayload;
}

export interface ServerToClientEventPayloads {
  [WS_EVENTS.DEVICE_ONLINE]: DeviceOnlinePayload;
  [WS_EVENTS.TASK_CREATED]: TaskCreatedPayload;
  [WS_EVENTS.TASK_STARTED]: TaskStartedPayload;
  [WS_EVENTS.TASK_OUTPUT]: TaskOutputPayload;
  [WS_EVENTS.TASK_WAITING_APPROVAL]: TaskWaitingApprovalPayload;
  [WS_EVENTS.TASK_APPROVAL_SUBMIT]: TaskApprovalSubmitPayload;
  [WS_EVENTS.TASK_APPROVAL_RESULT]: TaskApprovalResultPayload;
  [WS_EVENTS.TASK_COMPLETED]: TaskCompletedPayload;
  [WS_EVENTS.TASK_FAILED]: TaskFailedPayload;
  [WS_EVENTS.TASK_CANCEL]: TaskCancelPayload;
  [WS_EVENTS.TASK_RELAY_FAILED]: TaskRelayFailedPayload;
}

export type WsEventPayloads = ClientToServerEventPayloads & ServerToClientEventPayloads;
export type ClientToServerEventName = keyof ClientToServerEventPayloads;
export type ServerToClientEventName = keyof ServerToClientEventPayloads;
export type WsPayload<EventName extends WsEventName> = WsEventPayloads[EventName];

export interface WsMessage<EventName extends WsEventName = WsEventName> {
  eventName: EventName;
  payload: WsPayload<EventName>;
}

export function isWsEventName(value: string): value is WsEventName {
  return (WS_EVENT_NAMES as readonly string[]).includes(value);
}

export function createWsMessage<EventName extends WsEventName>(
  eventName: EventName,
  payload: WsPayload<EventName>
): WsMessage<EventName> {
  return {
    eventName,
    payload
  };
}
