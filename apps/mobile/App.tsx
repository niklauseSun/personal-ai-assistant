import type { AgentTaskStatus } from "@personal-ai-assistant/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { ApiClient } from "./src/api/api-client";
import { MobileWebSocketClient } from "./src/api/mobile-websocket-client";
import { CreateTaskScreen } from "./src/screens/CreateTaskScreen";
import { TaskDetailScreen } from "./src/screens/TaskDetailScreen";
import { TaskListScreen } from "./src/screens/TaskListScreen";
import { useTaskStore } from "./src/store/task-store";
import { colors, sharedStyles } from "./src/ui/styles";
import { toDisplayTaskStatus } from "./src/utils/status";

export interface HistoryFilters {
  status: AgentTaskStatus | "all";
  prompt: string;
  createdFrom: string;
  createdTo: string;
}

interface OutputPageState {
  hasMore: boolean;
  isLoading: boolean;
  nextCursor?: string;
}

const OUTPUT_PAGE_LIMIT = 100;

export default function App() {
  const clientRef = useRef(new MobileWebSocketClient());
  const {
    serverUrl,
    deviceId,
    connectionStatus,
    errorMessage,
    taskIds,
    tasksById,
    outputsByTaskId,
    approvalsByTaskId,
    selectedTaskId,
    screen,
    isLoadingHistory
  } = useTaskStore();

  const [serverUrlInput, setServerUrlInput] = useState(serverUrl);
  const [deviceIdInput, setDeviceIdInput] = useState(deviceId);
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>({
    status: "all",
    prompt: "",
    createdFrom: "",
    createdTo: ""
  });
  const [outputPages, setOutputPages] = useState<Record<string, OutputPageState>>({});

  useEffect(() => {
    return () => {
      clientRef.current.disconnect();
    };
  }, []);

  const tasks = useMemo(() => taskIds.map((taskId) => tasksById[taskId]).filter(Boolean), [
    taskIds,
    tasksById
  ]);
  const selectedTask = selectedTaskId ? tasksById[selectedTaskId] : undefined;
  const selectedOutputs = selectedTaskId ? outputsByTaskId[selectedTaskId] ?? [] : [];
  const selectedApprovals = selectedTaskId ? approvalsByTaskId[selectedTaskId] ?? [] : [];
  const selectedOutputPage = selectedTaskId ? outputPages[selectedTaskId] : undefined;
  const canRun = connectionStatus === "connected";
  const canCancel = selectedTask
    ? ["created", "running", "started", "waiting_approval"].includes(selectedTask.status)
    : false;

  const loadHistory = async (
    url = serverUrlInput,
    id = deviceIdInput,
    filters = historyFilters
  ) => {
    const normalizedUrl = url.trim();
    const normalizedDeviceId = id.trim();
    if (!normalizedUrl || !normalizedDeviceId) {
      return;
    }

    useTaskStore.getState().setHistoryLoading(true);
    try {
      const api = new ApiClient(normalizedUrl);
      const historyTasks = await api.listTasks({
        deviceId: normalizedDeviceId,
        status: filters.status,
        prompt: filters.prompt,
        createdFrom: filters.createdFrom,
        createdTo: filters.createdTo,
        limit: 50
      });
      useTaskStore.getState().setTasks(historyTasks.items);
      useTaskStore.getState().setError(undefined);
    } catch (error) {
      useTaskStore
        .getState()
        .setError(error instanceof Error ? error.message : "Failed to load task history");
    } finally {
      useTaskStore.getState().setHistoryLoading(false);
    }
  };

  const loadTaskDetail = async (taskId: string) => {
    setOutputPages((state) => ({
      ...state,
      [taskId]: {
        ...state[taskId],
        hasMore: state[taskId]?.hasMore ?? false,
        isLoading: true
      }
    }));

    try {
      const api = new ApiClient(useTaskStore.getState().serverUrl);
      const history = await api.getTask(taskId, { limit: OUTPUT_PAGE_LIMIT });
      useTaskStore.getState().upsertTask(history.task);
      useTaskStore.getState().setOutputs(taskId, history.outputsPage.items);
      useTaskStore.getState().setApprovals(taskId, history.approvals);
      setOutputPages((state) => ({
        ...state,
        [taskId]: {
          hasMore: history.outputsPage.hasMore,
          isLoading: false,
          nextCursor: history.outputsPage.nextCursor
        }
      }));
      useTaskStore.getState().setError(undefined);
    } catch (error) {
      useTaskStore
        .getState()
        .setError(error instanceof Error ? error.message : "Failed to load task detail");
      setOutputPages((state) => ({
        ...state,
        [taskId]: {
          ...state[taskId],
          hasMore: state[taskId]?.hasMore ?? false,
          isLoading: false
        }
      }));
    }
  };

  const loadMoreOutputs = async (taskId: string) => {
    const page = outputPages[taskId];
    if (!page?.hasMore || page.isLoading) {
      return;
    }

    setOutputPages((state) => ({
      ...state,
      [taskId]: {
        ...state[taskId],
        isLoading: true
      }
    }));

    try {
      const api = new ApiClient(useTaskStore.getState().serverUrl);
      const nextPage = await api.listOutputs(taskId, {
        cursor: page.nextCursor,
        limit: OUTPUT_PAGE_LIMIT
      });
      useTaskStore.getState().mergeOutputs(taskId, nextPage.items);
      setOutputPages((state) => ({
        ...state,
        [taskId]: {
          hasMore: nextPage.hasMore,
          isLoading: false,
          nextCursor: nextPage.nextCursor
        }
      }));
      useTaskStore.getState().setError(undefined);
    } catch (error) {
      useTaskStore
        .getState()
        .setError(error instanceof Error ? error.message : "Failed to load more output");
      setOutputPages((state) => ({
        ...state,
        [taskId]: {
          ...state[taskId],
          hasMore: state[taskId]?.hasMore ?? false,
          isLoading: false
        }
      }));
    }
  };

  const connect = () => {
    const normalizedServerUrl = serverUrlInput.trim();
    const normalizedDeviceId = deviceIdInput.trim();

    if (!normalizedServerUrl) {
      Alert.alert("Missing server URL", "Enter the server URL before connecting.");
      return;
    }

    if (!normalizedDeviceId) {
      Alert.alert("Missing device ID", "Enter a deviceId before connecting.");
      return;
    }

    useTaskStore.getState().setConfig({
      serverUrl: normalizedServerUrl,
      deviceId: normalizedDeviceId
    });
    useTaskStore.getState().setError(undefined);

    clientRef.current.connect({
      serverUrl: normalizedServerUrl,
      deviceId: normalizedDeviceId,
      handlers: {
        onConnectionStatus: (status) => useTaskStore.getState().setConnectionStatus(status),
        onDeviceOnline: () =>
          void loadHistory(normalizedServerUrl, normalizedDeviceId, historyFilters),
        onError: (message) => useTaskStore.getState().setError(message),
        onTask: (task) => useTaskStore.getState().upsertTask(task),
        onOutput: (chunk) => useTaskStore.getState().appendOutput(chunk),
        onApproval: (approval) => useTaskStore.getState().upsertApproval(approval),
        onApprovalResult: (result) => useTaskStore.getState().applyApprovalResult(result)
      }
    });
  };

  const disconnect = () => {
    clientRef.current.disconnect();
    useTaskStore.getState().setConnectionStatus("disconnected");
  };

  const createTask = (input: { workspacePath: string; prompt: string }) => {
    try {
      clientRef.current.createTask({
        deviceId: useTaskStore.getState().deviceId,
        workspacePath: input.workspacePath,
        prompt: input.prompt
      });
      useTaskStore.getState().setScreen("tasks");
      useTaskStore.getState().setError(undefined);
    } catch (error) {
      useTaskStore
        .getState()
        .setError(error instanceof Error ? error.message : "Failed to create task");
    }
  };

  const openTask = (taskId: string) => {
    useTaskStore.getState().selectTask(taskId);
    void loadTaskDetail(taskId);
  };

  const cancelTask = (taskId: string) => {
    try {
      clientRef.current.cancelTask(taskId);
      useTaskStore.getState().setError(undefined);
    } catch (error) {
      useTaskStore
        .getState()
        .setError(error instanceof Error ? error.message : "Failed to cancel task");
    }
  };

  const submitApproval = (
    taskId: string,
    approvalRequestId: string,
    decision: "approved" | "rejected"
  ) => {
    try {
      clientRef.current.submitApproval({
        taskId,
        approvalRequestId,
        decision,
        reason: decision === "rejected" ? "Rejected from mobile" : undefined
      });
      useTaskStore.getState().setError(undefined);
    } catch (error) {
      useTaskStore
        .getState()
        .setError(error instanceof Error ? error.message : "Failed to submit approval");
    }
  };

  const clearHistory = () => {
    const normalizedServerUrl = serverUrlInput.trim() || serverUrl;
    const normalizedDeviceId = deviceIdInput.trim() || deviceId;
    if (!normalizedServerUrl || !normalizedDeviceId) {
      Alert.alert("Missing device", "Connect or enter a deviceId before clearing history.");
      return;
    }

    Alert.alert(
      "Clear history",
      "This removes terminal tasks matching the current filters. Running tasks are kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => void clearHistoryNow(normalizedServerUrl, normalizedDeviceId)
        }
      ]
    );
  };

  const clearHistoryNow = async (normalizedServerUrl: string, normalizedDeviceId: string) => {
    useTaskStore.getState().setHistoryLoading(true);
    try {
      const api = new ApiClient(normalizedServerUrl);
      await api.clearHistory({
        deviceId: normalizedDeviceId,
        status: historyFilters.status,
        prompt: historyFilters.prompt,
        createdFrom: historyFilters.createdFrom,
        createdTo: historyFilters.createdTo
      });
      await loadHistory(normalizedServerUrl, normalizedDeviceId, historyFilters);
      useTaskStore.getState().setError(undefined);
    } catch (error) {
      useTaskStore
        .getState()
        .setError(error instanceof Error ? error.message : "Failed to clear history");
    } finally {
      useTaskStore.getState().setHistoryLoading(false);
    }
  };

  const renderScreen = () => {
    if (screen === "create") {
      return (
        <CreateTaskScreen
          canRun={canRun}
          onBack={() => useTaskStore.getState().setScreen("tasks")}
          onRun={createTask}
        />
      );
    }

    if (screen === "detail") {
      return (
        <TaskDetailScreen
          canCancel={canCancel}
          onBack={() => useTaskStore.getState().setScreen("tasks")}
          onCancel={cancelTask}
          onSubmitApproval={submitApproval}
          onRefresh={(taskId) => void loadTaskDetail(taskId)}
          hasMoreOutputs={selectedOutputPage?.hasMore ?? false}
          isLoadingOutputs={selectedOutputPage?.isLoading ?? false}
          onLoadMoreOutputs={(taskId) => void loadMoreOutputs(taskId)}
          approvals={selectedApprovals}
          outputs={selectedOutputs}
          task={selectedTask}
        />
      );
    }

    return (
      <TaskListScreen
        filters={historyFilters}
        isLoading={isLoadingHistory}
        onApplyFilters={() => void loadHistory(serverUrlInput, deviceIdInput, historyFilters)}
        onClearHistory={clearHistory}
        onCreate={() => useTaskStore.getState().setScreen("create")}
        onFiltersChange={setHistoryFilters}
        onOpenTask={openTask}
        onRefresh={() => void loadHistory()}
        tasks={tasks}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <View style={styles.page}>
          <View style={styles.connectionPanel}>
            <View style={styles.connectionHeader}>
              <View>
                <Text style={sharedStyles.label}>Mobile</Text>
                <Text style={sharedStyles.title}>Personal AI Assistant</Text>
              </View>
              <View style={styles.statusBlock}>
                <Text style={sharedStyles.label}>Status</Text>
                <Text style={styles.connectionStatus}>{connectionStatus}</Text>
              </View>
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={sharedStyles.label}>Server URL</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setServerUrlInput}
                  placeholder="http://localhost:3000"
                  style={sharedStyles.input}
                  value={serverUrlInput}
                />
              </View>
              <View style={styles.field}>
                <Text style={sharedStyles.label}>Device ID</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setDeviceIdInput}
                  placeholder="my-device"
                  style={sharedStyles.input}
                  value={deviceIdInput}
                />
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={connect} style={sharedStyles.button}>
                <Text style={sharedStyles.buttonText}>
                  {connectionStatus === "connected" ? "Reconnect" : "Connect"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={disconnect}
                style={[sharedStyles.button, sharedStyles.buttonGhost]}
              >
                <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>
                  Disconnect
                </Text>
              </Pressable>
            </View>

            <Text style={styles.deviceText}>Current deviceId: {deviceId || "not set"}</Text>
            {selectedTask ? (
              <Text style={styles.deviceText}>
                Selected task: {toDisplayTaskStatus(selectedTask.status)}
              </Text>
            ) : null}
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          </View>

          <View style={styles.screen}>{renderScreen()}</View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: 10
  },
  connectionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  connectionPanel: {
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: 12,
    paddingBottom: 14
  },
  connectionStatus: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right"
  },
  deviceText: {
    color: colors.muted,
    fontSize: 13
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700"
  },
  field: {
    flex: 1,
    gap: 6
  },
  fieldRow: {
    gap: 10
  },
  keyboard: {
    flex: 1
  },
  page: {
    backgroundColor: colors.background,
    flex: 1,
    padding: 16
  },
  safeArea: {
    backgroundColor: colors.background,
    flex: 1
  },
  screen: {
    flex: 1,
    minHeight: 520,
    paddingTop: 16
  },
  statusBlock: {
    alignItems: "flex-end"
  }
});
