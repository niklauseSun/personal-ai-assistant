import {
  WS_EVENTS,
  createWsMessage,
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
  | "device.online"
  | "task.create"
  | "task.created"
  | "task.started"
  | "task.output"
  | "task.waiting_approval"
  | "task.approval.submit"
  | "task.approval.result"
  | "task.completed"
  | "task.failed"
  | "task.cancel";

type RequiredEventsArePresent = Expect<Equal<WsEventName, RequiredEventNames>>;

const task: AgentTask = {
  id: "task-1",
  prompt: "Implement the shared protocol",
  status: "created",
  createdByDeviceId: "mobile-1",
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
  deviceId: "desktop-1",
  clientType: "desktop",
  status: "online",
  deviceName: "MacBook",
  registeredAt: createdAt,
  lastSeenAt: createdAt
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

const onlinePayload: ServerToClientEventPayloads[typeof WS_EVENTS.DEVICE_ONLINE] = {
  session,
  serverTime: createdAt
};

const createPayload: ClientToServerEventPayloads[typeof WS_EVENTS.TASK_CREATE] = {
  deviceId: "mobile-1",
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
  reason: "User cancelled"
};

const message: WsMessage<typeof WS_EVENTS.TASK_OUTPUT> = createWsMessage(
  WS_EVENTS.TASK_OUTPUT,
  outputPayload
);

const knownEvent: boolean = isWsEventName(WS_EVENTS.TASK_CREATED);

const requiredEventsArePresent: RequiredEventsArePresent = true;

void requiredEventsArePresent;
void registerPayload;
void onlinePayload;
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
void message;
void knownEvent;

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
