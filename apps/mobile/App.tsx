import type {
  AgentTask,
  DeviceSession,
  MobileBoundDesktop,
  MobileDeviceInfo
} from "@personal-ai-assistant/shared";
import { WS_EVENTS } from "@personal-ai-assistant/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  NativeModules,
  PanResponder,
  Platform,
  SafeAreaView,
  StyleSheet,
  TouchableWithoutFeedback,
  View
} from "react-native";
import { MobileWebSocketClient } from "./src/api/mobile-websocket-client";
import { BoundDesktopDrawer } from "./src/screens/BoundDesktopDrawer";
import { CreateTaskScreen } from "./src/screens/CreateTaskScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { PairingCodeScreen } from "./src/screens/PairingCodeScreen";
import { ScanBindingScreen } from "./src/screens/ScanBindingScreen";
import { TaskDetailScreen } from "./src/screens/TaskDetailScreen";
import {
  boundDesktopFromPairingPayload,
  loadDesktopBindingState,
  parsePairingPayload,
  saveDesktopBindingState,
  upsertBoundDesktop
} from "./src/store/desktop-binding-storage";
import { loadTaskHistoryFromDatabase } from "./src/store/task-history-db";
import { useTaskStore } from "./src/store/task-store";
import { FloatingActionButton } from "./src/ui/components";
import { t } from "./src/ui/i18n";
import { colors } from "./src/ui/theme";
import type { StatusFilterValue } from "./src/ui/components";

export interface HistoryFilters {
  status: StatusFilterValue;
  prompt: string;
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
  bindingToken: string | undefined,
  desktopId: string | undefined
) {
  const normalizedPrompt = filters.prompt.trim().toLowerCase();

  return tasks.filter((task) => {
    if (bindingToken && task.createdByDeviceId !== bindingToken) {
      return false;
    }

    if (
      desktopId &&
      task.assignedDesktopDeviceId &&
      task.assignedDesktopDeviceId !== desktopId
    ) {
      return false;
    }

    if (filters.status !== "all") {
      const status = task.status === "started" ? "running" : task.status === "queued" ? "created" : task.status;
      if (status !== filters.status) {
        return false;
      }
    }

    if (normalizedPrompt && !task.prompt.toLowerCase().includes(normalizedPrompt)) {
      return false;
    }

    return true;
  });
}

function getMobileDeviceInfo(): MobileDeviceInfo {
  const nativeConstants = toNativeRecord(NativeModules.PlatformConstants);
  const platformConstants = toNativeRecord(
    (Platform as unknown as { constants?: unknown }).constants
  );

  return {
    deviceName: firstNativeString(
      nativeConstants.DeviceName,
      nativeConstants.deviceName,
      platformConstants.DeviceName,
      platformConstants.deviceName
    ),
    modelName: firstNativeString(
      nativeConstants.Model,
      nativeConstants.model,
      nativeConstants.deviceModel,
      platformConstants.Model,
      platformConstants.model,
      platformConstants.deviceModel
    ),
    manufacturer: firstNativeString(
      nativeConstants.Manufacturer,
      nativeConstants.manufacturer,
      nativeConstants.Brand,
      nativeConstants.brand,
      platformConstants.Manufacturer,
      platformConstants.manufacturer,
      platformConstants.Brand,
      platformConstants.brand
    ),
    osName: Platform.OS,
    osVersion: String(Platform.Version),
    platform: Platform.OS
  };
}

function toNativeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstNativeString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export default function App() {
  const clientRef = useRef(new MobileWebSocketClient());
  const boundDesktopsRef = useRef<MobileBoundDesktop[]>([]);
  const pendingScannedDesktopRef = useRef<MobileBoundDesktop | undefined>(undefined);
  const hasSentBindingConfirmRef = useRef(false);
  const lastConnectionErrorRef = useRef<string | undefined>(undefined);
  const {
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

  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>({
    status: "all",
    prompt: ""
  });
  const [outputPages, setOutputPages] = useState<Record<string, OutputPageState>>({});
  const [desktopSessions, setDesktopSessions] = useState<DeviceSession[]>([]);
  const [boundDesktops, setBoundDesktops] = useState<MobileBoundDesktop[]>([]);
  const [activeBoundDesktopId, setActiveBoundDesktopId] = useState<string>();
  const [isDesktopDrawerOpen, setDesktopDrawerOpen] = useState(false);
  const [isLoadingDesktopBindings, setDesktopBindingsLoading] = useState(true);
  const [pendingScannedDesktop, setPendingScannedDesktop] = useState<MobileBoundDesktop>();
  const [pairingCodeInput, setPairingCodeInput] = useState("");
  const [pairingCodeError, setPairingCodeError] = useState<string>();
  const [isBindingConfirming, setBindingConfirming] = useState(false);

  useEffect(() => {
    boundDesktopsRef.current = boundDesktops;
  }, [boundDesktops]);

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
            .setError(error instanceof Error ? error.message : "Failed to load history");
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

  const tasks = useMemo(
    () => taskIds.map((taskId) => tasksById[taskId]).filter(Boolean),
    [taskIds, tasksById]
  );
  const selectedTask = selectedTaskId ? tasksById[selectedTaskId] : undefined;
  const selectedOutputs = selectedTaskId ? outputsByTaskId[selectedTaskId] ?? [] : [];
  const selectedApprovals = selectedTaskId ? approvalsByTaskId[selectedTaskId] ?? [] : [];
  const selectedOutputPage = selectedTaskId ? outputPages[selectedTaskId] : undefined;
  const activeBoundDesktop = useMemo(
    () => boundDesktops.find((desktop) => desktop.id === activeBoundDesktopId),
    [activeBoundDesktopId, boundDesktops]
  );
  const availableDesktops = useMemo(() => {
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
  }, [desktopSessions]);
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
  const activeDesktopOnline = activeBoundDesktop
    ? desktopPresenceById[activeBoundDesktop.desktopId]?.status === "online" ||
      connectionStatus === "connected"
    : false;
  const visibleTasks = useMemo(
    () =>
      filterLocalTasks(
        tasks,
        historyFilters,
        activeBoundDesktop?.bindingToken,
        activeBoundDesktop?.desktopId
      ),
    [activeBoundDesktop, historyFilters, tasks]
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

  const updatePendingScannedDesktop = (desktop: MobileBoundDesktop | undefined) => {
    pendingScannedDesktopRef.current = desktop;
    setPendingScannedDesktop(desktop);
  };

  const refreshHistory = () => {
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
  };

  const openBindingHelp = () => {
    Alert.alert("如何绑定设备", "在桌面端生成绑定二维码，然后使用手机扫描二维码完成绑定。");
  };

  const connectToDesktop = (desktop: MobileBoundDesktop) => {
    const normalizedServerUrl = desktop.serverUrl.trim();
    const bindingToken = desktop.bindingToken.trim();

    if (!normalizedServerUrl || !bindingToken) {
      useTaskStore.getState().setError("缺少桌面端绑定信息，请重新扫码绑定。");
      return;
    }

    useTaskStore.getState().setError(undefined);
    lastConnectionErrorRef.current = undefined;
    setDesktopSessions([]);

    clientRef.current.connect({
      serverUrl: normalizedServerUrl,
      bindingToken,
      handlers: {
        onConnectionStatus: (status) => {
          useTaskStore.getState().setConnectionStatus(status);
          if (pendingScannedDesktopRef.current && status === "disconnected") {
            setPairingCodeError(
              lastConnectionErrorRef.current ??
                "服务器连接已断开，请确认手机可以访问二维码中的 Server URL。"
            );
          }
        },
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

          const pendingDesktop = pendingScannedDesktopRef.current;
          if (
            pendingDesktop &&
            payload.session.clientType === "mobile" &&
            payload.session.deviceId === pendingDesktop.bindingToken
          ) {
            useTaskStore.getState().setError(undefined);
          }
        },
        onError: (message) => {
          lastConnectionErrorRef.current = message;
          useTaskStore.getState().setError(message);
          if (pendingScannedDesktopRef.current) {
            setPairingCodeError(message);
          }
        },
        onTask: (task) => useTaskStore.getState().upsertTask(task),
        onOutput: (chunk) => useTaskStore.getState().appendOutput(chunk),
        onApproval: (approval) => useTaskStore.getState().upsertApproval(approval),
        onApprovalResult: (result) => useTaskStore.getState().applyApprovalResult(result),
        onDesktopBindingConfirmed: (payload) => {
          const pendingDesktop = pendingScannedDesktopRef.current;
          if (
            !pendingDesktop ||
            payload.deviceId !== pendingDesktop.bindingToken ||
            payload.desktopId !== pendingDesktop.desktopId
          ) {
            return;
          }

          const nextDesktop = {
            ...pendingDesktop,
            updatedAt: payload.confirmedAt,
            lastUsedAt: payload.confirmedAt
          };
          const nextDesktops = upsertBoundDesktop(boundDesktopsRef.current, nextDesktop);

          updatePendingScannedDesktop(undefined);
          hasSentBindingConfirmRef.current = false;
          setBindingConfirming(false);
          setPairingCodeInput("");
          setPairingCodeError(undefined);
          boundDesktopsRef.current = nextDesktops;
          setBoundDesktops(nextDesktops);
          setActiveBoundDesktopId(nextDesktop.id);
          setDesktopDrawerOpen(false);
          useTaskStore.getState().setScreen("tasks");
          useTaskStore.getState().setError(undefined);
          void saveDesktopBindingState({
            bindings: nextDesktops,
            lastUsedDesktopId: nextDesktop.id
          }).catch((error) =>
            useTaskStore
              .getState()
              .setError(error instanceof Error ? error.message : "Failed to save desktop binding")
          );
        },
        onDesktopBindingFailed: (failure) => {
          const pendingDesktop = pendingScannedDesktopRef.current;
          if (
            !pendingDesktop ||
            failure.deviceId !== pendingDesktop.bindingToken ||
            failure.desktopId !== pendingDesktop.desktopId
          ) {
            return;
          }

          hasSentBindingConfirmRef.current = false;
          setBindingConfirming(false);
          setPairingCodeError(failure.reason);
          useTaskStore.getState().setError(failure.reason);
        },
        onRelayFailed: (failure) => {
          if (
            failure.failedEventName === WS_EVENTS.DESKTOP_BINDING_CONFIRM ||
            failure.failedEventName === WS_EVENTS.DESKTOP_BINDING_CONFIRMED
          ) {
            hasSentBindingConfirmRef.current = false;
            setBindingConfirming(false);
            setPairingCodeError(failure.error.message);
          }

          useTaskStore.getState().applyRelayFailure(failure);
          useTaskStore.getState().setError(failure.error.message);
        }
      }
    });
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
    void saveDesktopBindingState({
      bindings: nextDesktops,
      lastUsedDesktopId: nextDesktop.id
    }).catch((error) =>
      useTaskStore
        .getState()
        .setError(error instanceof Error ? error.message : "Failed to save desktop binding")
    );

    if (shouldConnect) {
      connectToDesktop(nextDesktop);
    }
  };

  const handleBindingScanned = (rawValue: string) => {
    try {
      const payload = parsePairingPayload(rawValue);
      const desktop = boundDesktopFromPairingPayload(payload);

      updatePendingScannedDesktop(desktop);
      hasSentBindingConfirmRef.current = false;
      setBindingConfirming(false);
      setPairingCodeInput("");
      setPairingCodeError(undefined);
      setDesktopDrawerOpen(false);
      useTaskStore.getState().setScreen("confirmBinding");
      useTaskStore.getState().setError(undefined);
      connectToDesktop(desktop);
    } catch (error) {
      useTaskStore
        .getState()
        .setError(error instanceof Error ? error.message : "Failed to bind desktop");
    }
  };

  const deleteBoundDesktop = (desktopIdToDelete: string) => {
    Alert.alert(t.alert.confirmDeleteTitle, t.alert.confirmDeleteBody, [
      { text: t.alert.cancel, style: "cancel" },
      {
        text: t.alert.confirm,
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

    if (activeBoundDesktopId === desktopIdToDelete) {
      clientRef.current.disconnect();
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

  const submitPairingCode = () => {
    const pendingDesktop = pendingScannedDesktopRef.current;
    const pairingCode = pairingCodeInput.trim();

    if (!pendingDesktop) {
      setPairingCodeError("请重新扫描桌面端二维码。");
      return;
    }

    if (!/^\d{6}$/.test(pairingCode)) {
      setPairingCodeError("请输入 6 位数字验证码。");
      return;
    }

    if (connectionStatus !== "connected") {
      setPairingCodeError("正在连接服务器，请稍候。");
      return;
    }

    if (hasSentBindingConfirmRef.current) {
      return;
    }

    try {
      hasSentBindingConfirmRef.current = true;
      setBindingConfirming(true);
      setPairingCodeError(undefined);
      clientRef.current.confirmDesktopBinding({
        deviceId: pendingDesktop.bindingToken,
        desktopId: pendingDesktop.desktopId,
        desktopName: pendingDesktop.desktopName,
        pairingCode,
        mobileDevice: getMobileDeviceInfo(),
        confirmedAt: new Date().toISOString()
      });
      useTaskStore.getState().setError("等待桌面端确认绑定...");
    } catch (error) {
      hasSentBindingConfirmRef.current = false;
      setBindingConfirming(false);
      setPairingCodeError(error instanceof Error ? error.message : "Failed to send pairing code");
    }
  };

  const createTask = (input: { workspacePath: string; prompt: string; targetDesktopId?: string }) => {
    try {
      const bindingToken = activeBoundDesktop?.bindingToken;
      if (!bindingToken) {
        throw new Error("请先绑定或选择一个桌面端再创建任务");
      }

      const now = new Date().toISOString();
      const taskId = createLocalTaskId();
      const targetDesktopId = input.targetDesktopId ?? activeBoundDesktop?.desktopId;
      useTaskStore.getState().upsertTask({
        id: taskId,
        prompt: input.prompt,
        status: "created",
        createdByDeviceId: bindingToken,
        assignedDesktopDeviceId: targetDesktopId,
        createdAt: now,
        updatedAt: now,
        metadata: {
          workspacePath: input.workspacePath
        }
      });
      clientRef.current.createTask({
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

  const renderScreen = () => {
    if (screen === "scanBinding") {
      return (
        <ScanBindingScreen
          onBack={() => useTaskStore.getState().setScreen("tasks")}
          onScanned={handleBindingScanned}
        />
      );
    }

    if (screen === "confirmBinding") {
      return (
        <PairingCodeScreen
          code={pairingCodeInput}
          connectionStatus={connectionStatus}
          desktop={pendingScannedDesktop}
          error={pairingCodeError}
          isSubmitting={isBindingConfirming}
          onBack={() => {
            updatePendingScannedDesktop(undefined);
            hasSentBindingConfirmRef.current = false;
            setBindingConfirming(false);
            setPairingCodeInput("");
            setPairingCodeError(undefined);
            useTaskStore.getState().setScreen("scanBinding");
          }}
          onCodeChange={(value) => {
            setPairingCodeInput(value.replace(/\D/g, "").slice(0, 6));
            setPairingCodeError(undefined);
          }}
          onSubmit={submitPairingCode}
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

    return (
      <HomeScreen
        activeDesktop={activeBoundDesktop}
        desktopOnline={activeDesktopOnline}
        errorMessage={errorMessage}
        isLoadingHistory={isLoadingHistory || isLoadingDesktopBindings}
        mobileLabel={undefined}
        onBindingHelp={openBindingHelp}
        onCreate={() => useTaskStore.getState().setScreen("create")}
        onOpenDrawer={() => setDesktopDrawerOpen(true)}
        onOpenTask={openTask}
        onRefresh={refreshHistory}
        onScan={() => useTaskStore.getState().setScreen("scanBinding")}
        onSearchChange={(value) => setHistoryFilters((state) => ({ ...state, prompt: value }))}
        onStatusFilterChange={(value) =>
          setHistoryFilters((state) => ({ ...state, status: value }))
        }
        searchText={historyFilters.prompt}
        statusFilter={historyFilters.status}
        tasks={visibleTasks}
      />
    );
  };

  const showFab = screen === "tasks" && Boolean(activeBoundDesktop);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <View style={styles.pageShell} {...panResponder.panHandlers}>
          <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
            <View style={styles.page}>{renderScreen()}</View>
          </TouchableWithoutFeedback>
          {showFab ? (
            <FloatingActionButton
              accessibilityLabel={t.create.fabLabel}
              label={t.create.fabLabel}
              onPress={() => useTaskStore.getState().setScreen("create")}
            />
          ) : null}
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
  keyboard: {
    flex: 1
  },
  page: {
    backgroundColor: colors.bg,
    flex: 1
  },
  pageShell: {
    backgroundColor: colors.bg,
    flex: 1
  },
  safeArea: {
    backgroundColor: colors.bg,
    flex: 1
  }
});
