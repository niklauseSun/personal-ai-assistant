import type { AgentTask, AgentTaskStatus, ApprovalRequest, OutputChunk } from "./models";
import type { TaskApprovalResultPayload } from "./ws-events";

export interface PaginatedResult<Item, Cursor extends string = string> {
  items: Item[];
  nextCursor?: Cursor;
  hasMore: boolean;
}

export interface TaskSearchQuery {
  deviceId: string;
  statuses?: AgentTaskStatus[];
  createdFrom?: string;
  createdTo?: string;
  prompt?: string;
  cursor?: string;
  limit?: number;
}

export type TaskListResponse = PaginatedResult<AgentTask>;

export interface TaskOutputPage extends PaginatedResult<OutputChunk> {
  taskId: string;
}

export interface TaskHistoryEvent {
  id: string;
  taskId: string;
  eventName: string;
  payload: unknown;
  createdAt: string;
}

export interface AgentTaskHistory {
  task: AgentTask;
  outputs: OutputChunk[];
  outputsPage: TaskOutputPage;
  approvals: ApprovalRequest[];
  approvalResults: TaskApprovalResultPayload[];
  events: TaskHistoryEvent[];
}

export interface ClearTaskHistoryResult {
  deletedCount: number;
}
