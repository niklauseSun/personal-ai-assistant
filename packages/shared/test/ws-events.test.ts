import {
  WS_EVENTS,
  createDesktopPairingPayload,
  createWsMessage,
  isDesktopPairingPayload,
  isWsEventName,
  type AgentTask,
  type ApprovalRequest,
  type ClientToServerEventPayloads,
  type DeviceSession,
  type OutputChunk,
  type ServerToClientEventPayloads,
  type WsEventName,
  type WsMessage
} from "../src";

const createdAt = "2026-05-13T00:00:00.000Z";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends (
    <Value>() => Value extends Right ? 1 : 2
  )
    ? true
    : false;

type Expect<Condition extends true> = Condition;

type RequiredEventNames =
  | "device.register"
  | "device.heartbeat"
  | "device.online"
  | "desktop.binding.confirm"
  | "desktop.binding.confirmed"
  | "desktop.binding.failed"
  | "task.create"
  | "task.created"
  | "task.started"
  | "task.output"
  | "task.waiting_approval"
  | "task.approval.submit"
  | "task.approval.result"
  | "task.completed"
  | "task.failed"
  | "task.cancel"
  | "task.relay_failed";

type RequiredEventsArePresent = Expect<Equal<WsEventName, RequiredEventNames>>;

const task: AgentTask = {
  id: "task-1",
  prompt: "Implement the shared protocol",
  status: "created",
  createdByDeviceId: "mobile-1",
  assignedDesktopDeviceId: "desktop-1",
  createdAt,
  updatedAt: createdAt
};

const chunk: OutputChunk = {
  id: "chunk-1",
  taskId: "task-1",
  sequence: 1,
  stream: "stdout",
  content: "Codex started",
  createdAt
};

const session: DeviceSession = {
  deviceId: "mobile-1",
  clientType: "desktop",
  status: "online",
  deviceName: "MacBook",
  registeredAt: createdAt,
  lastSeenAt: createdAt,
  metadata: {
    desktopId: "desktop-1"
  }
};

const approval: ApprovalRequest = {
  id: "approval-1",
  taskId: "task-1",
  status: "pending",
  title: "Run command",
  description: "Workspace: /tmp/project\nPrompt: Run tests",
  riskLevel: "medium",
  command: "pnpm test",
  createdAt
};

const registerPayload: ClientToServerEventPayloads[typeof WS_EVENTS.DEVICE_REGISTER] = {
  deviceId: "mobile-1",
  clientType: "mobile",
  deviceName: "iPhone"
};

const heartbeatPayload: ClientToServerEventPayloads[typeof WS_EVENTS.DEVICE_HEARTBEAT] = {
  deviceId: "mobile-1",
  clientType: "desktop",
  desktopId: "desktop-1",
  sentAt: createdAt
};

const onlinePayload: ServerToClientEventPayloads[typeof WS_EVENTS.DEVICE_ONLINE] = {
  session,
  serverTime: createdAt
};

const desktopBindingConfirmPayload: ClientToServerEventPayloads[typeof WS_EVENTS.DESKTOP_BINDING_CONFIRM] =
  {
    deviceId: "mobile-1",
    desktopId: "desktop-1",
    desktopName: "MacBook",
    pairingCode: "123456",
    mobileDevice: {
      deviceName: "Alex's iPhone",
      modelName: "iPhone 15 Pro",
      osName: "ios",
      osVersion: "17.5",
      platform: "ios"
    },
    confirmedAt: createdAt
  };

const desktopBindingConfirmedPayload: ServerToClientEventPayloads[typeof WS_EVENTS.DESKTOP_BINDING_CONFIRMED] =
  desktopBindingConfirmPayload;

const desktopBindingRelayPayload: ServerToClientEventPayloads[typeof WS_EVENTS.DESKTOP_BINDING_CONFIRM] =
  desktopBindingConfirmPayload;

const desktopBindingConfirmedFromDesktopPayload: ClientToServerEventPayloads[typeof WS_EVENTS.DESKTOP_BINDING_CONFIRMED] =
  desktopBindingConfirmPayload;

const desktopBindingFailedPayload: ServerToClientEventPayloads[typeof WS_EVENTS.DESKTOP_BINDING_FAILED] =
  {
    deviceId: "mobile-1",
    desktopId: "desktop-1",
    reason: "Invalid pairing code",
    rejectedAt: createdAt
  };

const desktopBindingFailedFromDesktopPayload: ClientToServerEventPayloads[typeof WS_EVENTS.DESKTOP_BINDING_FAILED] =
  desktopBindingFailedPayload;

const createPayload: ClientToServerEventPayloads[typeof WS_EVENTS.TASK_CREATE] = {
  deviceId: "mobile-1",
  targetDesktopId: "desktop-1",
  prompt: "Implement packages/shared"
};

const createdPayload: ServerToClientEventPayloads[typeof WS_EVENTS.TASK_CREATED] = {
  task
};

const startedPayload: ServerToClientEventPayloads[typeof WS_EVENTS.TASK_STARTED] = {
  task: {
    ...task,
    status: "started",
    startedAt: createdAt
  },
  startedAt: createdAt
};

const outputPayload: ServerToClientEventPayloads[typeof WS_EVENTS.TASK_OUTPUT] = {
  taskId: "task-1",
  chunk
};

const desktopOutputPayload: ClientToServerEventPayloads[typeof WS_EVENTS.TASK_OUTPUT] =
  outputPayload;

const waitingApprovalPayload: ServerToClientEventPayloads[typeof WS_EVENTS.TASK_WAITING_APPROVAL] = {
  task: {
    ...task,
    status: "waiting_approval"
  },
  approval
};

const approvalPayload: ClientToServerEventPayloads[typeof WS_EVENTS.TASK_APPROVAL_SUBMIT] = {
  taskId: "task-1",
  approvalRequestId: "approval-1",
  deviceId: "mobile-1",
  targetDesktopId: "desktop-1",
  decision: "approved"
};

const approvalResultPayload: ServerToClientEventPayloads[typeof WS_EVENTS.TASK_APPROVAL_RESULT] = {
  taskId: "task-1",
  approvalRequestId: "approval-1",
  status: "approved",
  decision: "approved",
  resolvedByDeviceId: "mobile-1",
  resolvedAt: createdAt
};

const completedPayload: ServerToClientEventPayloads[typeof WS_EVENTS.TASK_COMPLETED] = {
  task: {
    ...task,
    status: "completed",
    completedAt: createdAt
  },
  exitCode: 0
};

const failedPayload: ServerToClientEventPayloads[typeof WS_EVENTS.TASK_FAILED] = {
  task: {
    ...task,
    status: "failed",
    completedAt: createdAt
  },
  error: {
    code: "CODEX_FAILED",
    message: "Codex exited with a non-zero status"
  },
  exitCode: 1
};

const cancelPayload: ClientToServerEventPayloads[typeof WS_EVENTS.TASK_CANCEL] = {
  taskId: "task-1",
  deviceId: "mobile-1",
  targetDesktopId: "desktop-1",
  reason: "User cancelled"
};

const relayFailedPayload: ServerToClientEventPayloads[typeof WS_EVENTS.TASK_RELAY_FAILED] = {
  taskId: "task-1",
  deviceId: "mobile-1",
  targetDesktopId: "desktop-1",
  failedEventName: "task.created",
  attempts: 5,
  error: {
    code: "RELAY_TARGET_OFFLINE",
    message: "Desktop is not connected"
  },
  createdAt
};

const message: WsMessage<typeof WS_EVENTS.TASK_OUTPUT> = createWsMessage(
  WS_EVENTS.TASK_OUTPUT,
  outputPayload
);

const knownEvent: boolean = isWsEventName(WS_EVENTS.TASK_CREATED);
const pairingPayload = createDesktopPairingPayload({
  serverUrl: "http://localhost:3000",
  deviceToken: "device-token-1",
  desktopId: "desktop-1",
  desktopName: "MacBook"
});
const validPairingPayload: boolean = isDesktopPairingPayload(pairingPayload);
const invalidPairingPayload: boolean = isDesktopPairingPayload({
  ...pairingPayload,
  version: 2
});

const requiredEventsArePresent: RequiredEventsArePresent = true;

void requiredEventsArePresent;
void registerPayload;
void heartbeatPayload;
void onlinePayload;
void desktopBindingConfirmPayload;
void desktopBindingRelayPayload;
void desktopBindingConfirmedPayload;
void desktopBindingConfirmedFromDesktopPayload;
void desktopBindingFailedPayload;
void desktopBindingFailedFromDesktopPayload;
void createPayload;
void createdPayload;
void startedPayload;
void desktopOutputPayload;
void waitingApprovalPayload;
void approvalPayload;
void approvalResultPayload;
void completedPayload;
void failedPayload;
void cancelPayload;
void relayFailedPayload;
void message;
void knownEvent;
void validPairingPayload;
void invalidPairingPayload;

// @ts-expect-error task.create requires a prompt.
const invalidCreatePayload: ClientToServerEventPayloads[typeof WS_EVENTS.TASK_CREATE] = {
  deviceId: "mobile-1"
};

void invalidCreatePayload;

const invalidOutputPayload: ServerToClientEventPayloads[typeof WS_EVENTS.TASK_OUTPUT] = {
  taskId: "task-1",
  chunk: {
    id: "chunk-1",
    taskId: "task-1",
    sequence: 1,
    // @ts-expect-error task.output must carry a supported OutputStream value.
    stream: "log",
    content: "Unsupported stream",
    createdAt
  }
};

void invalidOutputPayload;

const invalidApprovalPayload: ClientToServerEventPayloads[typeof WS_EVENTS.TASK_APPROVAL_SUBMIT] = {
  taskId: "task-1",
  approvalRequestId: "approval-1",
  deviceId: "mobile-1",
  // @ts-expect-error approval decisions use persisted result values.
  decision: "approve"
};

void invalidApprovalPayload;
