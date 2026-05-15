import type {
  AgentTask,
  AgentTaskStatus,
  DeviceSession,
  MobileBoundDesktop
} from "@personal-ai-assistant/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View
} from "react-native";
import { MobileWebSocketClient } from "./src/api/mobile-websocket-client";
import { BoundDesktopDrawer } from "./src/screens/BoundDesktopDrawer";
import { CreateTaskScreen } from "./src/screens/CreateTaskScreen";
import { ScanBindingScreen } from "./src/screens/ScanBindingScreen";
import { TaskDetailScreen } from "./src/screens/TaskDetailScreen";
import { TaskListScreen } from "./src/screens/TaskListScreen";
import {
  boundDesktopFromPairingPayload,
  loadDesktopBindingState,
  parsePairingPayload,
  saveDesktopBindingState,
  upsertBoundDesktop
} from "./src/store/desktop-binding-storage";
import { loadTaskHistoryFromDatabase } from "./src/store/task-history-db";
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
}

function getDesktopId(session: DeviceSession) {
  const desktopId = session.metadata?.desktopId;
  return typeof desktopId === "string" && desktopId.trim() ? desktopId.trim() : undefined;
}

function createLocalTaskId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function filterLocalTasks(
  tasks: AgentTask[],
  filters: HistoryFilters,
  deviceId: string | undefined,
  desktopId: string | undefined
) {
  const normalizedPrompt = filters.prompt.trim().toLowerCase();
  const createdFrom = parseOptionalTime(filters.createdFrom);
  const createdTo = parseOptionalTime(filters.createdTo);

  return tasks.filter((task) => {
    if (deviceId && task.createdByDeviceId !== deviceId) {
      return false;
    }

    if (
      desktopId &&
      task.assignedDesktopDeviceId &&
      task.assignedDesktopDeviceId !== desktopId
    ) {
      return false;
    }

    if (filters.status !== "all" && task.status !== filters.status) {
      return false;
    }

    if (normalizedPrompt && !task.prompt.toLowerCase().includes(normalizedPrompt)) {
      return false;
    }

    const createdAt = Date.parse(task.createdAt);
    if (createdFrom !== undefined && createdAt < createdFrom) {
      return false;
    }

    if (createdTo !== undefined && createdAt > createdTo) {
      return false;
    }

    return true;
  });
}

function parseOptionalTime(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const time = Date.parse(normalized);
  return Number.isNaN(time) ? undefined : time;
}

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
  const [desktopSessions, setDesktopSessions] = useState<DeviceSession[]>([]);
  const [boundDesktops, setBoundDesktops] = useState<MobileBoundDesktop[]>([]);
  const [activeBoundDesktopId, setActiveBoundDesktopId] = useState<string>();
  const [isDesktopDrawerOpen, setDesktopDrawerOpen] = useState(false);
  const [isLoadingDesktopBindings, setDesktopBindingsLoading] = useState(true);

  useEffect(() => {
    return () => {
      clientRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    useTaskStore.getState().setHistoryLoading(true);
    loadTaskHistoryFromDatabase()
      .then((snapshot) => {
        if (!isMounted) {
          return;
        }

        useTaskStore.getState().hydrateTaskHistory(snapshot);
        useTaskStore.getState().setError(undefined);
      })
      .catch((error) => {
        if (isMounted) {
          useTaskStore
            .getState()
            .setError(error instanceof Error ? error.message : "Failed to load SQLite history");
        }
      })
      .finally(() => {
        if (isMounted) {
          useTaskStore.getState().setHistoryLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    loadDesktopBindingState()
      .then((state) => {
        if (!isMounted) {
          return;
        }

        setBoundDesktops(state.bindings);
        const defaultDesktop =
          state.bindings.find((desktop) => desktop.id === state.lastUsedDesktopId) ??
          state.bindings[0];

        if (defaultDesktop) {
          setActiveBoundDesktopId(defaultDesktop.id);
          setServerUrlInput(defaultDesktop.serverUrl);
          setDeviceIdInput(defaultDesktop.deviceId);
          useTaskStore.getState().setConfig({
            serverUrl: defaultDesktop.serverUrl,
            deviceId: defaultDesktop.deviceId
          });
        }
        setDesktopBindingsLoading(false);
      })
      .catch((error) => {
        if (isMounted) {
          useTaskStore
            .getState()
            .setError(error instanceof Error ? error.message : "Failed to load desktop bindings");
          setDesktopBindingsLoading(false);
        }
      });

    return () => {
      isMounted = false;
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
  const activeBoundDesktop = useMemo(
    () => boundDesktops.find((desktop) => desktop.id === activeBoundDesktopId),
    [activeBoundDesktopId, boundDesktops]
  );
  const availableDesktops = useMemo(
    () => {
      const byId = new Map<string, { desktopId: string; label: string }>();
      for (const session of desktopSessions) {
        if (session.status !== "online") {
          continue;
        }

        const desktopId = getDesktopId(session);
        if (!desktopId) {
          continue;
        }

        byId.set(desktopId, {
          desktopId,
          label: session.deviceName ?? desktopId
        });
      }

      return Array.from(byId.values());
    },
    [desktopSessions]
  );
  const desktopPresenceById = useMemo(() => {
    const presenceById: Record<string, { status: "online" | "offline"; lastSeenAt: string }> = {};
    for (const session of desktopSessions) {
      const desktopId = getDesktopId(session);
      if (!desktopId) {
        continue;
      }

      presenceById[desktopId] = {
        status: session.status,
        lastSeenAt: session.lastSeenAt
      };
    }

    return presenceById;
  }, [desktopSessions]);
  const visibleTasks = useMemo(
    () =>
      filterLocalTasks(
        tasks,
        historyFilters,
        activeBoundDesktop?.deviceId ?? deviceId,
        activeBoundDesktop?.desktopId
      ),
    [activeBoundDesktop, deviceId, historyFilters, tasks]
  );
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dx) > 48 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.4,
        onPanResponderRelease: (_event, gestureState) => {
          if (gestureState.dx < -70) {
            setDesktopDrawerOpen(true);
          }

          if (gestureState.dx > 70) {
            setDesktopDrawerOpen(false);
          }
        }
      }),
    []
  );
  const canRun = connectionStatus === "connected";
  const canCancel = selectedTask
    ? ["created", "running", "started", "waiting_approval"].includes(selectedTask.status)
    : false;

  const applyLocalHistoryFilters = () => {
    useTaskStore.getState().setHistoryLoading(false);
    useTaskStore.getState().setError(undefined);
  };

  const loadTaskDetail = (taskId: string) => {
    setOutputPages((state) => ({
      ...state,
      [taskId]: {
        hasMore: false,
        isLoading: false
      }
    }));
    useTaskStore.getState().setError(undefined);
  };

  const loadMoreOutputs = (taskId: string) => {
    setOutputPages((state) => ({
      ...state,
      [taskId]: {
        hasMore: false,
        isLoading: false
      }
    }));
    useTaskStore.getState().setError("All output is already loaded from local history.");
  };

  const connect = () => {
    connectTo(serverUrlInput, deviceIdInput);
  };

  const connectTo = (rawServerUrl: string, rawDeviceId: string) => {
    const normalizedServerUrl = rawServerUrl.trim();
    const normalizedDeviceId = rawDeviceId.trim();

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
    setServerUrlInput(normalizedServerUrl);
    setDeviceIdInput(normalizedDeviceId);
    useTaskStore.getState().setError(undefined);
    setDesktopSessions([]);

    clientRef.current.connect({
      serverUrl: normalizedServerUrl,
      deviceId: normalizedDeviceId,
      handlers: {
        onConnectionStatus: (status) => useTaskStore.getState().setConnectionStatus(status),
        onDeviceOnline: (payload) => {
          if (payload.session.clientType === "desktop") {
            const desktopId = getDesktopId(payload.session);
            if (desktopId) {
              setDesktopSessions((current) => {
                const withoutCurrent = current.filter(
                  (session) => getDesktopId(session) !== desktopId
                );
                return [...withoutCurrent, payload.session].sort((left, right) =>
                  (left.deviceName ?? "").localeCompare(right.deviceName ?? "")
                );
              });
            }
            return;
          }

          applyLocalHistoryFilters();
        },
        onError: (message) => useTaskStore.getState().setError(message),
        onTask: (task) => useTaskStore.getState().upsertTask(task),
        onOutput: (chunk) => useTaskStore.getState().appendOutput(chunk),
        onApproval: (approval) => useTaskStore.getState().upsertApproval(approval),
        onApprovalResult: (result) => useTaskStore.getState().applyApprovalResult(result),
        onRelayFailed: (failure) => {
          useTaskStore.getState().applyRelayFailure(failure);
          useTaskStore.getState().setError(failure.error.message);
        }
      }
    });
  };

  const disconnect = () => {
    clientRef.current.disconnect();
    useTaskStore.getState().setConnectionStatus("disconnected");
  };

  const selectBoundDesktop = (desktop: MobileBoundDesktop, shouldConnect = true) => {
    const nextDesktop = {
      ...desktop,
      lastUsedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const nextDesktops = upsertBoundDesktop(boundDesktops, nextDesktop);

    setBoundDesktops(nextDesktops);
    setActiveBoundDesktopId(nextDesktop.id);
    setDesktopDrawerOpen(false);
    setServerUrlInput(nextDesktop.serverUrl);
    setDeviceIdInput(nextDesktop.deviceId);
    useTaskStore.getState().setConfig({
      serverUrl: nextDesktop.serverUrl,
      deviceId: nextDesktop.deviceId
    });
    void saveDesktopBindingState({
      bindings: nextDesktops,
      lastUsedDesktopId: nextDesktop.id
    }).catch((error) =>
      useTaskStore
        .getState()
        .setError(error instanceof Error ? error.message : "Failed to save desktop binding")
    );

    if (shouldConnect) {
      connectTo(nextDesktop.serverUrl, nextDesktop.deviceId);
    }
  };

  const handleBindingScanned = (rawValue: string) => {
    try {
      const payload = parsePairingPayload(rawValue);
      const desktop = boundDesktopFromPairingPayload(payload);
      const nextDesktops = upsertBoundDesktop(boundDesktops, desktop);

      setBoundDesktops(nextDesktops);
      setActiveBoundDesktopId(desktop.id);
      setDesktopDrawerOpen(false);
      useTaskStore.getState().setScreen("tasks");
      useTaskStore.getState().setError(undefined);
      void saveDesktopBindingState({
        bindings: nextDesktops,
        lastUsedDesktopId: desktop.id
      }).catch((error) =>
        useTaskStore
          .getState()
          .setError(error instanceof Error ? error.message : "Failed to save desktop binding")
      );
      connectTo(desktop.serverUrl, desktop.deviceId);
    } catch (error) {
      useTaskStore
        .getState()
        .setError(error instanceof Error ? error.message : "Failed to bind desktop");
    }
  };

  const deleteBoundDesktop = (desktopIdToDelete: string) => {
    Alert.alert("Delete desktop", "This desktop will need to be bound again before reuse.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void deleteBoundDesktopNow(desktopIdToDelete)
      }
    ]);
  };

  const deleteBoundDesktopNow = async (desktopIdToDelete: string) => {
    const nextDesktops = boundDesktops.filter((desktop) => desktop.id !== desktopIdToDelete);
    const nextActiveDesktop =
      activeBoundDesktopId === desktopIdToDelete ? nextDesktops[0] : activeBoundDesktop;

    setBoundDesktops(nextDesktops);
    setActiveBoundDesktopId(nextActiveDesktop?.id);

    if (nextActiveDesktop) {
      setServerUrlInput(nextActiveDesktop.serverUrl);
      setDeviceIdInput(nextActiveDesktop.deviceId);
      useTaskStore.getState().setConfig({
        serverUrl: nextActiveDesktop.serverUrl,
        deviceId: nextActiveDesktop.deviceId
      });
    } else if (activeBoundDesktopId === desktopIdToDelete) {
      clientRef.current.disconnect();
      setDeviceIdInput("");
      useTaskStore.getState().setConfig({
        serverUrl: serverUrlInput,
        deviceId: ""
      });
      useTaskStore.getState().setConnectionStatus("disconnected");
    }

    try {
      await saveDesktopBindingState({
        bindings: nextDesktops,
        lastUsedDesktopId: nextActiveDesktop?.id
      });
      useTaskStore.getState().setError(undefined);
    } catch (error) {
      useTaskStore
        .getState()
        .setError(error instanceof Error ? error.message : "Failed to delete desktop binding");
    }
  };

  const createTask = (input: { workspacePath: string; prompt: string; targetDesktopId?: string }) => {
    try {
      const now = new Date().toISOString();
      const taskId = createLocalTaskId();
      const targetDesktopId = input.targetDesktopId ?? activeBoundDesktop?.desktopId;
      useTaskStore.getState().upsertTask({
        id: taskId,
        prompt: input.prompt,
        status: "created",
        createdByDeviceId: useTaskStore.getState().deviceId,
        assignedDesktopDeviceId: targetDesktopId,
        createdAt: now,
        updatedAt: now,
        metadata: {
          workspacePath: input.workspacePath
        }
      });
      clientRef.current.createTask({
        deviceId: useTaskStore.getState().deviceId,
        targetDesktopId,
        requestId: taskId,
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
    loadTaskDetail(taskId);
  };

  const cancelTask = (taskId: string) => {
    try {
      const targetDesktopId =
        useTaskStore.getState().tasksById[taskId]?.assignedDesktopDeviceId ??
        activeBoundDesktop?.desktopId;
      clientRef.current.cancelTask(taskId, targetDesktopId);
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
      const targetDesktopId =
        useTaskStore.getState().tasksById[taskId]?.assignedDesktopDeviceId ??
        activeBoundDesktop?.desktopId;
      clientRef.current.submitApproval({
        taskId,
        approvalRequestId,
        targetDesktopId,
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
    if (visibleTasks.length === 0) {
      Alert.alert("No local records", "There are no task records to clear.");
      return;
    }

    Alert.alert(
      "Clear local records",
      "This removes the task records currently shown on this phone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: clearHistoryNow
        }
      ]
    );
  };

  const clearHistoryNow = () => {
    useTaskStore.getState().clearTasks(visibleTasks.map((task) => task.id));
    useTaskStore.getState().setError(undefined);
  };

  const deleteTask = (taskId: string) => {
    Alert.alert("Delete local task", "This removes the task record from this phone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => useTaskStore.getState().deleteTask(taskId)
      }
    ]);
  };

  const renderScreen = () => {
    if (screen === "scanBinding") {
      return (
        <ScanBindingScreen
          onBack={() => useTaskStore.getState().setScreen("tasks")}
          onScanned={handleBindingScanned}
        />
      );
    }

    if (screen === "create") {
      return (
        <CreateTaskScreen
          availableDesktops={availableDesktops}
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
          onRefresh={loadTaskDetail}
          hasMoreOutputs={selectedOutputPage?.hasMore ?? false}
          isLoadingOutputs={selectedOutputPage?.isLoading ?? false}
          onLoadMoreOutputs={loadMoreOutputs}
          approvals={selectedApprovals}
          outputs={selectedOutputs}
          task={selectedTask}
        />
      );
    }

    if (isLoadingDesktopBindings) {
      return (
        <View style={styles.emptyBindingPanel}>
          <Text style={sharedStyles.label}>Desktops</Text>
          <Text style={styles.emptyBindingTitle}>Loading desktop bindings</Text>
          <Text style={sharedStyles.muted}>Checking the last desktop you used.</Text>
        </View>
      );
    }

    if (boundDesktops.length === 0) {
      return (
        <View style={styles.emptyBindingPanel}>
          <Text style={sharedStyles.label}>Desktops</Text>
          <Text style={styles.emptyBindingTitle}>No desktop bound</Text>
          <Text style={sharedStyles.muted}>
            Bind a desktop before creating or viewing Codex tasks.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => useTaskStore.getState().setScreen("scanBinding")}
            style={sharedStyles.button}
          >
            <Text style={sharedStyles.buttonText}>Bind desktop</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <TaskListScreen
        filters={historyFilters}
        isLoading={isLoadingHistory}
        onApplyFilters={applyLocalHistoryFilters}
        onClearHistory={clearHistory}
        onCreate={() => useTaskStore.getState().setScreen("create")}
        onDeleteTask={deleteTask}
        onFiltersChange={setHistoryFilters}
        onOpenTask={openTask}
        onRefresh={applyLocalHistoryFilters}
        tasks={visibleTasks}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <View style={styles.pageShell} {...panResponder.panHandlers}>
          <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
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
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setDesktopDrawerOpen(true)}
                    style={[sharedStyles.button, sharedStyles.buttonGhost]}
                  >
                    <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>
                      Desktops
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={connect}
                    style={sharedStyles.button}
                  >
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
                <Text style={styles.deviceText}>
                  Active desktop: {activeBoundDesktop?.desktopName ?? "not selected"}
                </Text>
                <Text style={styles.deviceText}>
                  Online desktops:{" "}
                  {availableDesktops.length > 0
                    ? availableDesktops.map((desktop) => desktop.label).join(", ")
                    : "none"}
                </Text>
                {selectedTask ? (
                  <Text style={styles.deviceText}>
                    Selected task: {toDisplayTaskStatus(selectedTask.status)}
                  </Text>
                ) : null}
                {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
              </View>

              <View style={styles.screen}>{renderScreen()}</View>
            </View>
          </TouchableWithoutFeedback>
          <BoundDesktopDrawer
            activeDesktopId={activeBoundDesktopId}
            desktopPresenceById={desktopPresenceById}
            desktops={boundDesktops}
            isOpen={isDesktopDrawerOpen}
            onClose={() => setDesktopDrawerOpen(false)}
            onDelete={deleteBoundDesktop}
            onScan={() => {
              setDesktopDrawerOpen(false);
              useTaskStore.getState().setScreen("scanBinding");
            }}
            onSelect={selectBoundDesktop}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  emptyBindingPanel: {
    gap: 10,
    paddingVertical: 24
  },
  emptyBindingTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700"
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700"
  },
  field: {
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
    padding: 16,
    paddingBottom: 28
  },
  pageShell: {
    backgroundColor: colors.background,
    flex: 1
  },
  safeArea: {
    backgroundColor: colors.background,
    flex: 1
  },
  screen: {
    flex: 1,
    paddingTop: 16
  },
  statusBlock: {
    alignItems: "flex-end"
  }
});
