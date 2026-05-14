import type {
  AgentTask,
  ApprovalRequest,
  OutputChunk,
  TaskApprovalResultPayload
} from "@personal-ai-assistant/shared";
import { create } from "zustand";

export type MobileScreen = "tasks" | "create" | "detail";
export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected";

interface TaskState {
  serverUrl: string;
  deviceId: string;
  connectionStatus: ConnectionStatus;
  errorMessage?: string;
  tasksById: Record<string, AgentTask>;
  taskIds: string[];
  outputsByTaskId: Record<string, OutputChunk[]>;
  approvalsByTaskId: Record<string, ApprovalRequest[]>;
  selectedTaskId?: string;
  screen: MobileScreen;
  isLoadingHistory: boolean;
  setConfig: (config: { serverUrl: string; deviceId: string }) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setError: (message?: string) => void;
  setScreen: (screen: MobileScreen) => void;
  selectTask: (taskId: string) => void;
  setHistoryLoading: (isLoadingHistory: boolean) => void;
  setTasks: (tasks: AgentTask[]) => void;
  upsertTask: (task: AgentTask) => void;
  appendOutput: (chunk: OutputChunk) => void;
  mergeOutputs: (taskId: string, outputs: OutputChunk[]) => void;
  setOutputs: (taskId: string, outputs: OutputChunk[]) => void;
  upsertApproval: (approval: ApprovalRequest) => void;
  setApprovals: (taskId: string, approvals: ApprovalRequest[]) => void;
  applyApprovalResult: (result: TaskApprovalResultPayload) => void;
}

function sortTaskIds(tasksById: Record<string, AgentTask>) {
  return Object.values(tasksById)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((task) => task.id);
}

export const useTaskStore = create<TaskState>((set) => ({
  serverUrl: "http://localhost:3000",
  deviceId: "",
  connectionStatus: "idle",
  tasksById: {},
  taskIds: [],
  outputsByTaskId: {},
  approvalsByTaskId: {},
  screen: "tasks",
  isLoadingHistory: false,
  setConfig: (config) =>
    set({
      serverUrl: config.serverUrl.trim(),
      deviceId: config.deviceId.trim()
    }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setError: (errorMessage) => set({ errorMessage }),
  setScreen: (screen) => set({ screen }),
  selectTask: (taskId) =>
    set({
      selectedTaskId: taskId,
      screen: "detail"
    }),
  setHistoryLoading: (isLoadingHistory) => set({ isLoadingHistory }),
  setTasks: (tasks) =>
    set((state) => {
      const tasksById = { ...state.tasksById };
      for (const task of tasks) {
        tasksById[task.id] = {
          ...tasksById[task.id],
          ...task
        };
      }

      return {
        tasksById,
        taskIds: tasks
          .slice()
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .map((task) => task.id)
      };
    }),
  upsertTask: (task) =>
    set((state) => {
      const existing = state.tasksById[task.id];
      const tasksById = {
        ...state.tasksById,
        [task.id]: {
          ...existing,
          ...task,
          prompt: task.prompt || existing?.prompt || "",
          createdAt: task.createdAt || existing?.createdAt || new Date().toISOString()
        }
      };

      return {
        tasksById,
        taskIds: sortTaskIds(tasksById)
      };
    }),
  appendOutput: (chunk) =>
    set((state) => {
      const current = state.outputsByTaskId[chunk.taskId] ?? [];
      const withoutDuplicate = current.filter((item) => item.id !== chunk.id);
      const next = [...withoutDuplicate, chunk].sort((left, right) => left.sequence - right.sequence);

      return {
        outputsByTaskId: {
          ...state.outputsByTaskId,
          [chunk.taskId]: next
        }
      };
    }),
  mergeOutputs: (taskId, outputs) =>
    set((state) => {
      const current = state.outputsByTaskId[taskId] ?? [];
      const byId = new Map(current.map((output) => [output.id, output]));
      for (const output of outputs) {
        byId.set(output.id, output);
      }

      return {
        outputsByTaskId: {
          ...state.outputsByTaskId,
          [taskId]: Array.from(byId.values()).sort(
            (left, right) => left.sequence - right.sequence
          )
        }
      };
    }),
  setOutputs: (taskId, outputs) =>
    set((state) => ({
      outputsByTaskId: {
        ...state.outputsByTaskId,
        [taskId]: outputs.sort((left, right) => left.sequence - right.sequence)
      }
    })),
  upsertApproval: (approval) =>
    set((state) => {
      const current = state.approvalsByTaskId[approval.taskId] ?? [];
      const withoutDuplicate = current.filter((item) => item.id !== approval.id);
      const next = [...withoutDuplicate, approval].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt)
      );

      return {
        approvalsByTaskId: {
          ...state.approvalsByTaskId,
          [approval.taskId]: next
        }
      };
    }),
  setApprovals: (taskId, approvals) =>
    set((state) => ({
      approvalsByTaskId: {
        ...state.approvalsByTaskId,
        [taskId]: approvals.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      }
    })),
  applyApprovalResult: (result) =>
    set((state) => {
      const current = state.approvalsByTaskId[result.taskId] ?? [];
      return {
        approvalsByTaskId: {
          ...state.approvalsByTaskId,
          [result.taskId]: current.map((approval) =>
            approval.id === result.approvalRequestId
              ? {
                  ...approval,
                  status: result.status,
                  resolvedAt: result.resolvedAt,
                  resolvedByDeviceId: result.resolvedByDeviceId
                }
              : approval
          )
        }
      };
    })
}));
