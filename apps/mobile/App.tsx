import type {
  AgentTask,
  AgentTaskStatus,
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
  bindingToken: string | undefined,
  desktopId: string | undefined
) {
  const normalizedPrompt = filters.prompt.trim().toLowerCase();
  const createdFrom = parseOptionalTime(filters.createdFrom);
  const createdTo = parseOptionalTime(filters.createdTo);

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

interface PairingCodeScreenProps {
  code: string;
  connectionStatus: string;
  desktop?: MobileBoundDesktop;
  error?: string;
  isSubmitting: boolean;
  onBack: () => void;
  onCodeChange: (value: string) => void;
  onSubmit: () => void;
}

function PairingCodeScreen({
  code,
  connectionStatus,
  desktop,
  error,
  isSubmitting,
  onBack,
  onCodeChange,
  onSubmit
}: PairingCodeScreenProps) {
  const canSubmit = code.length === 6 && connectionStatus === "connected" && !isSubmitting;

  return (
    <View style={styles.confirmBindingPanel}>
      <View style={styles.connectionHeader}>
        <View>
          <Text style={sharedStyles.label}>Bind</Text>
          <Text style={sharedStyles.title}>Confirm code</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={[sharedStyles.button, sharedStyles.buttonGhost]}
        >
          <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>Back</Text>
        </Pressable>
      </View>

      <View style={sharedStyles.card}>
        <Text style={styles.confirmDesktopName}>{desktop?.desktopName ?? "Desktop"}</Text>
        <Text style={sharedStyles.muted}>{desktop?.serverUrl ?? "No relay URL from desktop"}</Text>
        <Text style={styles.deviceText}>Relay status: {connectionStatus}</Text>
      </View>

      <View style={styles.codeBlock}>
        <Text style={sharedStyles.label}>Pairing code</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={onCodeChange}
          placeholder="000000"
          style={[sharedStyles.input, styles.codeInput, error ? styles.codeInputError : null]}
          value={code}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={onSubmit}
        style={[sharedStyles.button, !canSubmit ? styles.disabledButton : null]}
      >
        <Text style={sharedStyles.buttonText}>
          {isSubmitting ? "Confirming..." : "Confirm binding"}
        </Text>
      </Pressable>
    </View>
  );
}

function HeaderDeviceIcon() {
  return (
    <View style={styles.headerIcon}>
      <View style={styles.headerMonitorScreen} />
      <View style={styles.headerMonitorStand} />
      <View style={styles.headerMonitorBase} />
    </View>
  );
}

function MenuGlyph() {
  return (
    <View style={styles.menuGlyph}>
      <View style={styles.menuLine} />
      <View style={styles.menuLine} />
      <View style={styles.menuLine} />
    </View>
  );
}

function LinkGlyph({ light = false }: { light?: boolean }) {
  return (
    <View style={styles.linkGlyph}>
      <View
        style={[styles.linkLoop, light ? styles.linkLoopLight : null, styles.linkLoopLeft]}
      />
      <View
        style={[styles.linkLoop, light ? styles.linkLoopLight : null, styles.linkLoopRight]}
      />
    </View>
  );
}

function UnboundDeviceIllustration() {
  return (
    <View style={styles.unboundIllustration}>
      <Text style={[styles.sparkle, styles.sparkleTopLeft]}>+</Text>
      <Text style={[styles.sparkle, styles.sparkleTopRight]}>+</Text>
      <Text style={[styles.sparkle, styles.sparkleLeft]}>+</Text>
      <Text style={[styles.sparkle, styles.sparkleRight]}>+</Text>
      <View style={styles.sparkleCircle} />
      <View style={styles.sparkleDiamond} />

      <View style={styles.heroMonitor}>
        <View style={styles.heroMonitorInner}>
          <View style={styles.heroLinkCircle}>
            <LinkGlyph />
          </View>
        </View>
      </View>
      <View style={styles.heroMonitorStem} />
      <View style={styles.heroMonitorBase} />
      <View style={styles.alertBubble}>
        <Text style={styles.alertBubbleText}>!</Text>
      </View>
    </View>
  );
}

export default function App() {
  const clientRef = useRef(new MobileWebSocketClient());
  const boundDesktopsRef = useRef<MobileBoundDesktop[]>([]);
  const pendingScannedDesktopRef = useRef<MobileBoundDesktop | undefined>(undefined);
  const hasSentBindingConfirmRef = useRef(false);
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
  const isUnboundHome =
    !isLoadingDesktopBindings && boundDesktops.length === 0 && screen === "tasks";

  const updatePendingScannedDesktop = (desktop: MobileBoundDesktop | undefined) => {
    pendingScannedDesktopRef.current = desktop;
    setPendingScannedDesktop(desktop);
  };

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
    if (!activeBoundDesktop) {
      Alert.alert("No desktop selected", "Bind or select a desktop before connecting.");
      return;
    }

    connectToDesktop(activeBoundDesktop);
  };

  const openBindingHelp = () => {
    Alert.alert(
      "如何绑定设备",
      "在桌面端生成绑定二维码，然后使用手机扫描二维码完成绑定。"
    );
  };

  const connectToDesktop = (desktop: MobileBoundDesktop) => {
    const normalizedServerUrl = desktop.serverUrl.trim();
    const bindingToken = desktop.bindingToken.trim();

    if (!normalizedServerUrl) {
      Alert.alert("Missing relay URL", "This desktop binding does not include a relay URL.");
      return;
    }

    if (!bindingToken) {
      Alert.alert("Invalid desktop binding", "Scan the desktop QR code again.");
      return;
    }

    useTaskStore.getState().setError(undefined);
    setDesktopSessions([]);

    clientRef.current.connect({
      serverUrl: normalizedServerUrl,
      bindingToken,
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

          const pendingDesktop = pendingScannedDesktopRef.current;
          if (
            pendingDesktop &&
            payload.session.clientType === "mobile" &&
            payload.session.deviceId === pendingDesktop.bindingToken
          ) {
            useTaskStore.getState().setError(undefined);
            return;
          }

          applyLocalHistoryFilters();
        },
        onError: (message) => useTaskStore.getState().setError(message),
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
            updatePendingScannedDesktop(undefined);
            hasSentBindingConfirmRef.current = false;
            setBindingConfirming(false);
            setPairingCodeInput("");
            setPairingCodeError(undefined);
            useTaskStore.getState().setScreen("scanBinding");
          }

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
      setPairingCodeError("Scan the desktop QR code again.");
      return;
    }

    if (!/^\d{6}$/.test(pairingCode)) {
      setPairingCodeError("Enter the 6-digit pairing code.");
      return;
    }

    if (connectionStatus !== "connected") {
      setPairingCodeError("Mobile is still connecting to the desktop relay.");
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
      useTaskStore.getState().setError("Waiting for desktop to confirm binding.");
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
        throw new Error("Bind or select a desktop before creating a task");
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

  const renderUnboundHome = () => (
    <View style={styles.unboundHome}>
      <View style={styles.unboundTopBar}>
        <View style={styles.unboundTopLeft}>
          <HeaderDeviceIcon />
          <View style={styles.unboundTitleBlock}>
            <View style={styles.unboundTitleRow}>
              <Text style={styles.unboundTopTitle}>未绑定设备</Text>
              <View style={styles.unboundStatusDot} />
              <Text style={styles.unboundStatusText}>离线</Text>
            </View>
            <Text style={styles.unboundTopSubtitle}>请先绑定设备以使用 Codex</Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel="打开设备菜单"
          accessibilityRole="button"
          onPress={() => setDesktopDrawerOpen(true)}
          style={styles.unboundMenuButton}
        >
          <MenuGlyph />
        </Pressable>
      </View>

      <View style={styles.unboundCard}>
        <View style={styles.unboundCardContent}>
          <UnboundDeviceIllustration />
          <Text style={styles.unboundCardTitle}>未绑定设备</Text>
          <Text style={styles.unboundCardCopy}>
            绑定后可查看命令记录、任务历史{"\n"}并在多设备间同步
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => useTaskStore.getState().setScreen("scanBinding")}
            style={styles.unboundPrimaryButton}
          >
            <LinkGlyph light />
            <Text style={styles.unboundPrimaryButtonText}>去绑定设备</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={openBindingHelp}
            style={styles.unboundLearnButton}
          >
            <Text style={styles.unboundLearnText}>了解如何绑定</Text>
            <Text style={styles.unboundLearnChevron}>›</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

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
              {isUnboundHome ? (
                renderUnboundHome()
              ) : (
                <>
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
                        disabled={!activeBoundDesktop}
                        onPress={connect}
                        style={[
                          sharedStyles.button,
                          !activeBoundDesktop ? styles.disabledButton : null
                        ]}
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

                    <Text style={styles.deviceText}>
                      Active desktop: {activeBoundDesktop?.desktopName ?? "not selected"}
                    </Text>
                    {activeBoundDesktop ? (
                      <Text numberOfLines={1} style={styles.deviceText}>
                        Relay URL: {activeBoundDesktop.serverUrl}
                      </Text>
                    ) : null}
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
                </>
              )}
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
  codeBlock: {
    gap: 8
  },
  codeInput: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 0,
    textAlign: "center"
  },
  codeInputError: {
    borderColor: colors.danger
  },
  confirmBindingPanel: {
    gap: 16
  },
  confirmDesktopName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6
  },
  deviceText: {
    color: colors.muted,
    fontSize: 13
  },
  disabledButton: {
    opacity: 0.55
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
  alertBubble: {
    alignItems: "center",
    backgroundColor: "#6554e8",
    borderRadius: 18,
    bottom: 24,
    height: 36,
    justifyContent: "center",
    position: "absolute",
    right: 31,
    elevation: 4,
    shadowColor: "#6554e8",
    shadowOffset: {
      height: 6,
      width: 0
    },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    width: 36
  },
  alertBubbleText: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "500",
    lineHeight: 22
  },
  headerIcon: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#eef0fb",
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#7166a8",
    shadowOffset: {
      height: 6,
      width: 0
    },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    width: 48
  },
  headerMonitorBase: {
    backgroundColor: "#8f8dad",
    borderRadius: 2,
    height: 3,
    marginTop: 1,
    width: 18
  },
  headerMonitorScreen: {
    borderColor: "#8f8dad",
    borderRadius: 4,
    borderWidth: 3,
    height: 20,
    width: 26
  },
  headerMonitorStand: {
    backgroundColor: "#8f8dad",
    height: 5,
    width: 4
  },
  heroLinkCircle: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#dcd8fb",
    shadowOffset: {
      height: 5,
      width: 0
    },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    width: 48
  },
  heroMonitor: {
    alignItems: "center",
    borderColor: "#ded9ff",
    borderRadius: 10,
    borderWidth: 2,
    height: 76,
    justifyContent: "center",
    left: 32,
    position: "absolute",
    top: 34,
    width: 124
  },
  heroMonitorBase: {
    backgroundColor: "#ded9ff",
    borderRadius: 3,
    height: 3,
    left: 66,
    position: "absolute",
    top: 134,
    width: 54
  },
  heroMonitorInner: {
    alignItems: "center",
    backgroundColor: "#faf9ff",
    borderBottomColor: "#ded9ff",
    borderBottomWidth: 2,
    borderRadius: 10,
    height: "100%",
    justifyContent: "center",
    width: "100%"
  },
  heroMonitorStem: {
    borderBottomColor: "#ded9ff",
    borderBottomWidth: 3,
    borderLeftColor: "transparent",
    borderLeftWidth: 6,
    borderRightColor: "transparent",
    borderRightWidth: 6,
    height: 17,
    left: 84,
    position: "absolute",
    top: 110,
    width: 20
  },
  keyboard: {
    flex: 1
  },
  linkGlyph: {
    height: 18,
    position: "relative",
    width: 20
  },
  linkLoop: {
    borderColor: "#6554e8",
    borderRadius: 6,
    borderWidth: 2,
    height: 11,
    position: "absolute",
    top: 3,
    transform: [{ rotate: "-38deg" }],
    width: 12
  },
  linkLoopLeft: {
    left: 2
  },
  linkLoopLight: {
    borderColor: "#ffffff"
  },
  linkLoopRight: {
    right: 2
  },
  menuGlyph: {
    gap: 4,
    width: 22
  },
  menuLine: {
    backgroundColor: "#111827",
    borderRadius: 2,
    height: 2,
    width: 22
  },
  page: {
    backgroundColor: "#f8f9ff",
    flex: 1,
    padding: 16,
    paddingBottom: 28
  },
  pageShell: {
    backgroundColor: "#f8f9ff",
    flex: 1
  },
  safeArea: {
    backgroundColor: "#f8f9ff",
    flex: 1
  },
  screen: {
    flex: 1,
    paddingTop: 16
  },
  sparkle: {
    color: "#ded9fb",
    fontSize: 19,
    fontWeight: "700",
    opacity: 0.72,
    position: "absolute"
  },
  sparkleCircle: {
    borderColor: "#ded9fb",
    borderRadius: 5,
    borderWidth: 2,
    height: 10,
    left: 84,
    opacity: 0.72,
    position: "absolute",
    top: 0,
    width: 10
  },
  sparkleDiamond: {
    borderColor: "#ded9fb",
    borderRadius: 3,
    borderWidth: 2,
    height: 8,
    left: 10,
    opacity: 0.72,
    position: "absolute",
    top: 80,
    transform: [{ rotate: "45deg" }],
    width: 8
  },
  sparkleLeft: {
    left: 0,
    top: 48
  },
  sparkleRight: {
    right: 14,
    top: 57
  },
  sparkleTopLeft: {
    left: 28,
    top: 4
  },
  sparkleTopRight: {
    right: 40,
    top: 8
  },
  statusBlock: {
    alignItems: "flex-end"
  },
  unboundCard: {
    backgroundColor: "#ffffff",
    borderColor: "#f1f2fb",
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 26,
    elevation: 3,
    shadowColor: "#ced3ee",
    shadowOffset: {
      height: 10,
      width: 0
    },
    shadowOpacity: 0.11,
    shadowRadius: 20
  },
  unboundCardContent: {
    alignItems: "center",
    gap: 10
  },
  unboundCardCopy: {
    color: "#7a8197",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center"
  },
  unboundCardTitle: {
    color: "#111827",
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 25
  },
  unboundHome: {
    flex: 1,
    paddingTop: 4
  },
  unboundIllustration: {
    height: 146,
    marginBottom: 2,
    position: "relative",
    width: 188
  },
  unboundLearnButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 2,
    minHeight: 34,
    paddingHorizontal: 12
  },
  unboundLearnChevron: {
    color: "#6554e8",
    fontSize: 20,
    lineHeight: 22
  },
  unboundLearnText: {
    color: "#6554e8",
    fontSize: 14,
    fontWeight: "700"
  },
  unboundMenuButton: {
    alignItems: "center",
    height: 38,
    justifyContent: "center",
    width: 38
  },
  unboundPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#6554e8",
    borderRadius: 12,
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    marginTop: 8,
    maxWidth: "100%",
    minHeight: 48,
    minWidth: 190,
    paddingHorizontal: 24,
    elevation: 3,
    shadowColor: "#6554e8",
    shadowOffset: {
      height: 6,
      width: 0
    },
    shadowOpacity: 0.17,
    shadowRadius: 12
  },
  unboundPrimaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },
  unboundStatusDot: {
    backgroundColor: "#9aa0b2",
    borderRadius: 3.5,
    height: 7,
    marginLeft: 6,
    width: 7
  },
  unboundStatusText: {
    color: "#8b91a3",
    fontSize: 12,
    fontWeight: "700"
  },
  unboundTitleBlock: {
    flex: 1,
    gap: 3
  },
  unboundTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5
  },
  unboundTopBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  unboundTopLeft: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12
  },
  unboundTopSubtitle: {
    color: "#7d8498",
    fontSize: 13,
    lineHeight: 18
  },
  unboundTopTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 26
  }
});
