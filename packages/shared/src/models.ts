export type Id = string;
export type IsoDateTime = string;

export type ClientType = "desktop" | "mobile";
export type DeviceRole = "MOBILE" | "DESKTOP";
export type DeviceConnectionStatus = "online" | "offline";

export interface DeviceSession {
  deviceId: Id;
  clientType: ClientType;
  status: DeviceConnectionStatus;
  deviceName?: string;
  clientVersion?: string;
  connectionId?: string;
  registeredAt: IsoDateTime;
  lastSeenAt: IsoDateTime;
  metadata?: Record<string, unknown>;
}

export interface MobileDeviceInfo {
  deviceName?: string;
  modelName?: string;
  manufacturer?: string;
  osName?: string;
  osVersion?: string;
  platform?: string;
}

export type AgentTaskStatus =
  | "queued"
  | "created"
  | "started"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "rejected";

export interface AgentTask {
  id: Id;
  prompt: string;
  status: AgentTaskStatus;
  createdByDeviceId: Id;
  assignedDesktopDeviceId?: Id;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  startedAt?: IsoDateTime;
  completedAt?: IsoDateTime;
  metadata?: Record<string, unknown>;
}

export type OutputStream = "stdout" | "stderr" | "system";

export interface OutputChunk {
  id: Id;
  taskId: Id;
  sequence: number;
  stream: OutputStream;
  content: string;
  createdAt: IsoDateTime;
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";
export type ApprovalDecision = "approved" | "rejected";
export type RiskLevel = "low" | "medium" | "high";

export interface ApprovalRequest {
  id: Id;
  taskId: Id;
  status: ApprovalStatus;
  title: string;
  description?: string;
  riskLevel: RiskLevel;
  message?: string;
  command?: string;
  metadata?: Record<string, unknown>;
  createdAt: IsoDateTime;
  resolvedAt?: IsoDateTime;
  resolvedByDeviceId?: Id;
}

export interface SharedError {
  code: string;
  message: string;
  details?: unknown;
}
