import type {
  AgentTask,
  ApprovalRequest,
  OutputChunk,
  TaskApprovalResultPayload,
  TaskRelayFailedPayload
} from "@personal-ai-assistant/shared";
import { create } from "zustand";
import {
  clearTasksFromDatabase,
  deleteTaskFromDatabase,
  saveApprovalToDatabase,
  saveApprovalsForTaskToDatabase,
  saveOutputToDatabase,
  saveOutputsForTaskToDatabase,
  saveTaskToDatabase,
  saveTasksToDatabase,
  type TaskHistorySnapshot
} from "./task-history-db";

export type MobileScreen = "tasks" | "create" | "detail" | "scanBinding";
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
  hydrateTaskHistory: (snapshot: TaskHistorySnapshot) => void;
  setTasks: (tasks: AgentTask[]) => void;
  upsertTask: (task: AgentTask) => void;
  appendOutput: (chunk: OutputChunk) => void;
  mergeOutputs: (taskId: string, outputs: OutputChunk[]) => void;
  setOutputs: (taskId: string, outputs: OutputChunk[]) => void;
  upsertApproval: (approval: ApprovalRequest) => void;
  setApprovals: (taskId: string, approvals: ApprovalRequest[]) => void;
  applyApprovalResult: (result: TaskApprovalResultPayload) => void;
  applyRelayFailure: (failure: TaskRelayFailedPayload) => void;
  deleteTask: (taskId: string) => void;
  clearTasks: (taskIds?: string[]) => void;
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
      hydrateTaskHistory: (snapshot) =>
        set((state) => {
          const tasksById = { ...state.tasksById };
          for (const task of snapshot.tasks) {
            tasksById[task.id] = {
              ...task,
              ...tasksById[task.id]
            };
          }

          return {
            tasksById,
            taskIds: sortTaskIds(tasksById),
            outputsByTaskId: {
              ...snapshot.outputsByTaskId,
              ...state.outputsByTaskId
            },
            approvalsByTaskId: {
              ...snapshot.approvalsByTaskId,
              ...state.approvalsByTaskId
            }
          };
        }),
      setTasks: (tasks) =>
        {
          persistSqlite(() => saveTasksToDatabase(tasks));
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
            taskIds: sortTaskIds(tasksById)
          };
        });
        },
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
          persistSqlite(() => saveTaskToDatabase(tasksById[task.id]));

          return {
            tasksById,
            taskIds: sortTaskIds(tasksById)
          };
        }),
      appendOutput: (chunk) =>
        set((state) => {
          const current = state.outputsByTaskId[chunk.taskId] ?? [];
          const withoutDuplicate = current.filter((item) => item.id !== chunk.id);
          const next = [...withoutDuplicate, chunk].sort(
            (left, right) => left.sequence - right.sequence
          );
          persistSqlite(() => saveOutputToDatabase(chunk));

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
          const nextOutputs = Array.from(byId.values()).sort(
            (left, right) => left.sequence - right.sequence
          );
          persistSqlite(() => saveOutputsForTaskToDatabase(taskId, nextOutputs));

          return {
            outputsByTaskId: {
              ...state.outputsByTaskId,
              [taskId]: nextOutputs
            }
          };
        }),
      setOutputs: (taskId, outputs) =>
        {
          const nextOutputs = outputs.slice().sort((left, right) => left.sequence - right.sequence);
          persistSqlite(() => saveOutputsForTaskToDatabase(taskId, nextOutputs));
          set((state) => ({
            outputsByTaskId: {
              ...state.outputsByTaskId,
              [taskId]: nextOutputs
            }
          }));
        },
      upsertApproval: (approval) =>
        set((state) => {
          const current = state.approvalsByTaskId[approval.taskId] ?? [];
          const withoutDuplicate = current.filter((item) => item.id !== approval.id);
          const next = [...withoutDuplicate, approval].sort((left, right) =>
            left.createdAt.localeCompare(right.createdAt)
          );
          persistSqlite(() => saveApprovalToDatabase(approval));

          return {
            approvalsByTaskId: {
              ...state.approvalsByTaskId,
              [approval.taskId]: next
            }
          };
        }),
      setApprovals: (taskId, approvals) =>
        {
          const nextApprovals = approvals
            .slice()
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
          persistSqlite(() => saveApprovalsForTaskToDatabase(taskId, nextApprovals));
          set((state) => ({
            approvalsByTaskId: {
              ...state.approvalsByTaskId,
              [taskId]: nextApprovals
            }
          }));
        },
      applyApprovalResult: (result) =>
        set((state) => {
          const current = state.approvalsByTaskId[result.taskId] ?? [];
          const nextApprovals = current.map((approval) =>
            approval.id === result.approvalRequestId
              ? {
                  ...approval,
                  status: result.status,
                  resolvedAt: result.resolvedAt,
                  resolvedByDeviceId: result.resolvedByDeviceId
                }
              : approval
          );
          persistSqlite(() => saveApprovalsForTaskToDatabase(result.taskId, nextApprovals));

          return {
            approvalsByTaskId: {
              ...state.approvalsByTaskId,
              [result.taskId]: nextApprovals
            }
          };
        }),
      applyRelayFailure: (failure) =>
        set((state) => {
          if (!failure.taskId) {
            return {};
          }

          const existing = state.tasksById[failure.taskId];
          const now = failure.createdAt;
          const task: AgentTask = {
            id: failure.taskId,
            prompt: existing?.prompt ?? "",
            status: "failed",
            createdByDeviceId: existing?.createdByDeviceId ?? failure.deviceId,
            assignedDesktopDeviceId:
              existing?.assignedDesktopDeviceId ?? failure.targetDesktopId,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            completedAt: now,
            metadata: {
              ...existing?.metadata,
              relayFailure: {
                failedEventName: failure.failedEventName,
                attempts: failure.attempts,
                error: failure.error
              }
            }
          };
          const tasksById = {
            ...state.tasksById,
            [task.id]: task
          };
          persistSqlite(() => saveTaskToDatabase(task));

          return {
            tasksById,
            taskIds: sortTaskIds(tasksById)
          };
        }),
      deleteTask: (taskId) =>
        set((state) => {
          persistSqlite(() => deleteTaskFromDatabase(taskId));
          const tasksById = { ...state.tasksById };
          const outputsByTaskId = { ...state.outputsByTaskId };
          const approvalsByTaskId = { ...state.approvalsByTaskId };
          delete tasksById[taskId];
          delete outputsByTaskId[taskId];
          delete approvalsByTaskId[taskId];

          return {
            tasksById,
            taskIds: state.taskIds.filter((id) => id !== taskId),
            outputsByTaskId,
            approvalsByTaskId,
            selectedTaskId: state.selectedTaskId === taskId ? undefined : state.selectedTaskId,
            screen: state.selectedTaskId === taskId ? "tasks" : state.screen
          };
        }),
      clearTasks: (taskIds) =>
        set((state) => {
          persistSqlite(() => clearTasksFromDatabase(taskIds));
          const idsToDelete = new Set(taskIds ?? state.taskIds);
          const tasksById = { ...state.tasksById };
          const outputsByTaskId = { ...state.outputsByTaskId };
          const approvalsByTaskId = { ...state.approvalsByTaskId };

          for (const taskId of idsToDelete) {
            delete tasksById[taskId];
            delete outputsByTaskId[taskId];
            delete approvalsByTaskId[taskId];
          }

          const selectedTaskWasDeleted =
            state.selectedTaskId !== undefined && idsToDelete.has(state.selectedTaskId);

          return {
            tasksById,
            taskIds: state.taskIds.filter((taskId) => !idsToDelete.has(taskId)),
            outputsByTaskId,
            approvalsByTaskId,
            selectedTaskId: selectedTaskWasDeleted ? undefined : state.selectedTaskId,
            screen: selectedTaskWasDeleted ? "tasks" : state.screen
          };
        })
    }));

function persistSqlite(operation: () => Promise<void>) {
  void operation().catch((error) => {
    console.warn(
      error instanceof Error ? error.message : "Failed to persist task history to SQLite"
    );
  });
}
