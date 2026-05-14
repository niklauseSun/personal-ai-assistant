import type { AgentTask, AgentTaskStatus } from "@personal-ai-assistant/shared";

export type DisplayTaskStatus =
  | "created"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "rejected";

export function toDisplayTaskStatus(status: AgentTaskStatus): DisplayTaskStatus {
  if (status === "started") {
    return "running";
  }

  if (status === "queued") {
    return "created";
  }

  return status;
}

export function taskUpdatedWithStatus(
  task: AgentTask,
  status: AgentTaskStatus,
  timestamp = new Date().toISOString()
): AgentTask {
  return {
    ...task,
    status,
    updatedAt: timestamp
  };
}

export function statusColor(status: DisplayTaskStatus) {
  switch (status) {
    case "created":
      return "#5f6b7a";
    case "running":
      return "#25636f";
    case "waiting_approval":
      return "#9a5b13";
    case "completed":
      return "#18794e";
    case "failed":
      return "#b42318";
    case "cancelled":
      return "#6b7280";
    case "rejected":
      return "#7f1d1d";
  }
}
