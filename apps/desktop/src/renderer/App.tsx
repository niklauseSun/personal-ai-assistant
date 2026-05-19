import type {
  DesktopAppConfig,
  DesktopBindingConfirmPayload,
  DesktopMobileBinding,
  MobileDeviceInfo
} from "@personal-ai-assistant/shared";
import { createDesktopPairingPayload, WS_EVENTS, WS_NAMESPACE } from "@personal-ai-assistant/shared";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { pingServerHealth, type ServerHealthStatus } from "./server-health";

const BROWSER_CONFIG_STORAGE_KEY = "personal-ai-assistant.desktop-config";
const DEFAULT_SERVER_URL = "http://122.51.133.4:3000";
type ServerStatus = "checking" | ServerHealthStatus;

const emptyConfig: DesktopAppConfig = {
  serverUrl: DEFAULT_SERVER_URL,
  desktopName: "Desktop",
  serverPersistence: "relay_only",
  bindings: []
};

export function App() {
  const isBrowserPreview = typeof window !== "undefined" && !window.desktopShell;
  const configRef = useRef<DesktopAppConfig>(emptyConfig);
  const [config, setConfig] = useState<DesktopAppConfig>(emptyConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [qrBindingId, setQrBindingId] = useState<string>();
  const [pendingPairingBinding, setPendingPairingBinding] = useState<DesktopMobileBinding>();
  const [pendingPairingCode, setPendingPairingCode] = useState<string>();
  const [qrDataUrl, setQrDataUrl] = useState<string>();
  const [qrError, setQrError] = useState<string>();
  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");
  const [isServerUrlEditing, setIsServerUrlEditing] = useState(false);
  const [serverUrlDraft, setServerUrlDraft] = useState(DEFAULT_SERVER_URL);
  const [serverUrlError, setServerUrlError] = useState<string>();
  const [serverUrlPingStatus, setServerUrlPingStatus] = useState<ServerHealthStatus>();
  const [isPinging, setIsPinging] = useState(false);
  const configuredServerUrl = config.serverUrl.trim();
  const serverUrlDraftValue = serverUrlDraft.trim();
  const enabledCount = useMemo(
    () => config.bindings.filter((binding) => binding.enabled).length,
    [config.bindings]
  );
  const needsServerSetup = configuredServerUrl.length === 0 || serverStatus === "unavailable";
  const connectionModeLabel = !configuredServerUrl
    ? "Server not configured"
    : serverStatus === "available"
      ? `${enabledCount} enabled`
      : serverStatusLabel(serverStatus);
  const qrBinding = useMemo(
    () => pendingPairingBinding ?? config.bindings.find((binding) => binding.id === qrBindingId),
    [config.bindings, pendingPairingBinding, qrBindingId]
  );

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    let isMounted = true;

    if (!qrBinding || !configuredServerUrl) {
      setQrDataUrl(undefined);
      setQrError(undefined);
      return () => {
        isMounted = false;
      };
    }

    const payload = createPairingPayload(config, qrBinding);
    QRCode.toDataURL(JSON.stringify(payload), {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 260
    })
      .then((dataUrl) => {
        if (isMounted) {
          setQrDataUrl(dataUrl);
          setQrError(undefined);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setQrDataUrl(undefined);
          setQrError(error instanceof Error ? error.message : "Failed to generate QR code");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [config, configuredServerUrl, qrBinding]);

  useEffect(() => {
    if (!pendingPairingBinding || !pendingPairingCode || !configuredServerUrl) {
      return;
    }

    let isActive = true;
    const socket = io(namespaceUrl(configuredServerUrl), {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000
    });

    socket.on("connect", () => {
      socket.emit(WS_EVENTS.DEVICE_REGISTER, {
        deviceId: pendingPairingBinding.deviceId,
        clientType: "desktop",
        deviceName: configRef.current.desktopName,
        metadata: {
          desktopId: pendingPairingBinding.id,
          pendingPairing: true,
          serverPersistence: "relay_only"
        }
      });
    });

    socket.on(WS_EVENTS.DESKTOP_BINDING_CONFIRM, (payload: DesktopBindingConfirmPayload) => {
      if (
        payload.deviceId !== pendingPairingBinding.deviceId ||
        payload.desktopId !== pendingPairingBinding.id
      ) {
        return;
      }

      if (payload.pairingCode !== pendingPairingCode) {
        socket.emit(WS_EVENTS.DESKTOP_BINDING_FAILED, {
          deviceId: pendingPairingBinding.deviceId,
          desktopId: pendingPairingBinding.id,
          reason: "Invalid pairing code",
          rejectedAt: new Date().toISOString()
        });
        setMessage("Mobile entered the wrong pairing code. Ask them to try again.");
        return;
      }

      const completedBinding = {
        ...pendingPairingBinding,
        displayName:
          formatMobileDeviceDisplayName(payload.mobileDevice) ||
          pendingPairingBinding.displayName ||
          "Mobile",
        mobileDevice: payload.mobileDevice,
        enabled: true,
        updatedAt: payload.confirmedAt
      };
      const nextConfig = addDesktopBinding(configRef.current, completedBinding);

      getDesktopShell()
        .saveConfig(nextConfig)
        .then((savedConfig) => {
          if (!isActive) {
            return;
          }

          configRef.current = savedConfig;
          setConfig(savedConfig);
          socket.emit(WS_EVENTS.DESKTOP_BINDING_CONFIRMED, payload);
          setPendingPairingBinding(undefined);
          setPendingPairingCode(undefined);
          setQrBindingId(undefined);
          setMessage("Mobile binding completed. Desktop WebSocket bindings were reloaded.");
        })
        .catch((error) => {
          if (isActive) {
            setMessage(error instanceof Error ? error.message : "Failed to save mobile binding");
          }
        });
    });

    socket.on("connect_error", (error) => {
      if (isActive) {
        setMessage(`Binding relay unavailable: ${error.message}`);
      }
    });

    socket.connect();

    return () => {
      isActive = false;
      socket.disconnect();
    };
  }, [configuredServerUrl, pendingPairingBinding, pendingPairingCode]);

  useEffect(() => {
    let isMounted = true;

    if (!configuredServerUrl) {
      setServerStatus("unavailable");
      return () => {
        isMounted = false;
      };
    }

    setServerStatus("checking");

    pingServerHealth(configuredServerUrl)
      .then((result) => {
        if (!isMounted) {
          return;
        }

        setServerStatus(result.status);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setServerStatus("unavailable");
      });

    return () => {
      isMounted = false;
    };
  }, [configuredServerUrl]);

  useEffect(() => {
    let isMounted = true;

    getDesktopShell()
      .getConfig()
      .then((nextConfig) => {
        if (!isMounted) {
          return;
        }

        setConfig(nextConfig);
        setServerUrlDraft(nextConfig.serverUrl);
        setMessage(undefined);
      })
      .catch((error) => {
        if (isMounted) {
          setMessage(error instanceof Error ? error.message : "Failed to load desktop config");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const updateConfig = <Key extends keyof DesktopAppConfig>(
    key: Key,
    value: DesktopAppConfig[Key]
  ) => {
    setConfig((current) => ({
      ...current,
      [key]: value
    }));
  };

  const updateBinding = <Key extends keyof DesktopMobileBinding>(
    bindingId: string,
    key: Key,
    value: DesktopMobileBinding[Key]
  ) => {
    setConfig((current) => ({
      ...current,
      bindings: current.bindings.map((binding) =>
        binding.id === bindingId
          ? {
              ...binding,
              [key]: value,
              updatedAt: new Date().toISOString()
            }
          : binding
      )
    }));
  };

  const addBinding = () => {
    const nextConfig = {
      ...config,
      bindings: [...config.bindings, createBinding()]
    };
    setConfig(nextConfig);
    if (!qrBindingId) {
      setQrBindingId(nextConfig.bindings[0]?.id);
    }
  };

  const openPairingModal = (binding: DesktopMobileBinding, nextMessage?: string) => {
    setPendingPairingBinding(binding);
    setPendingPairingCode(createPairingCode());
    setQrBindingId(binding.id);
    setMessage(nextMessage ?? "Scan the QR code from mobile to finish binding.");
  };

  const createPairingBinding = () => {
    const binding = createBinding({
      displayName: "Mobile"
    });

    openPairingModal(binding);
  };

  const closePairingModal = () => {
    if (pendingPairingBinding && qrBinding?.id === pendingPairingBinding.id) {
      setPendingPairingBinding(undefined);
      setPendingPairingCode(undefined);
    }

    setQrBindingId(undefined);
  };

  const beginServerUrlEdit = () => {
    setServerUrlDraft(config.serverUrl);
    setServerUrlError(undefined);
    setServerUrlPingStatus(undefined);
    setIsServerUrlEditing(true);
  };

  const cancelServerUrlEdit = () => {
    setServerUrlDraft(config.serverUrl);
    setServerUrlError(undefined);
    setServerUrlPingStatus(undefined);
    setIsServerUrlEditing(false);
  };

  const updateServerUrlDraft = (value: string) => {
    setServerUrlDraft(value);
    setServerUrlError(undefined);
    setServerUrlPingStatus(undefined);
  };

  const pingServerUrlDraft = async () => {
    const serverUrl = serverUrlDraftValue;
    setIsPinging(true);
    setServerUrlError(undefined);
    setServerUrlPingStatus(undefined);

    try {
      const result = await pingServerHealth(serverUrl);
      setServerUrlPingStatus(result.status);
      if (serverUrl === configuredServerUrl) {
        setServerStatus(result.status);
      }

      if (result.status === "unavailable") {
        setServerUrlError(result.message);
      }

      setMessage(
        result.status === "available"
          ? `Ping succeeded. ${result.message}`
          : `Ping failed. ${result.message}`
      );
      return result.status === "available";
    } finally {
      setIsPinging(false);
    }
  };

  const saveServerUrlDraft = async () => {
    const serverUrl = serverUrlDraftValue;
    if (!serverUrl) {
      const errorMessage = "Enter a server URL before saving.";
      setServerUrlError(errorMessage);
      setMessage(`Ping failed. ${errorMessage}`);
      return;
    }

    const canReachServer = await pingServerUrlDraft();
    if (!canReachServer) {
      return;
    }

    const nextConfig = {
      ...config,
      serverUrl
    };
    await persistConfig(nextConfig, "Server saved. Mobile relay is ready for QR pairing.");
    setServerStatus("available");
    setServerUrlError(undefined);
    setServerUrlPingStatus(undefined);
    setIsServerUrlEditing(false);
  };

  const removeBinding = (bindingId: string) => {
    setConfig((current) => {
      const nextBindings = current.bindings.filter((binding) => binding.id !== bindingId);
      return {
        ...current,
        bindings: nextBindings
      };
    });
    if (qrBindingId === bindingId) {
      setQrBindingId(undefined);
    }
  };

  const saveConfig = async () => {
    await persistConfig(
      {
        ...config,
        serverUrl: config.serverUrl.trim(),
        serverPersistence: "relay_only"
      },
      configuredServerUrl
        ? "Saved. Desktop WebSocket bindings were reloaded."
        : "Saved. Desktop remains in local-only mode until a server URL is configured."
    );
  };

  const persistConfig = async (nextConfig: DesktopAppConfig, successMessage: string) => {
    setIsSaving(true);
    try {
      const savedConfig = await getDesktopShell().saveConfig({
        ...nextConfig,
        serverUrl: nextConfig.serverUrl.trim(),
        serverPersistence: "relay_only"
      });
      setConfig(savedConfig);
      setServerUrlDraft(savedConfig.serverUrl);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save desktop config");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="shell">
      {needsServerSetup ? (
        <>
          <section className="page-header" aria-labelledby="desktop-title">
            <div>
              <p className="eyebrow">Desktop</p>
              <h1 id="desktop-title">Bind mobile</h1>
              {isBrowserPreview ? (
                <p className="preview-banner">
                  Browser preview mode: settings are stored in localStorage until the Electron app
                  loads this page with its desktop bridge.
                </p>
              ) : null}
            </div>
            <div className="status-pill" aria-label="Connection status">
              {connectionModeLabel}
            </div>
          </section>

          <section className="section setup-section compact-setup" aria-labelledby="setup-title">
            <div className="compact-setup-body">
              <ServerUrlControl
                error={serverUrlError}
                isEditing={isServerUrlEditing}
                isLoading={isLoading}
                isPinging={isPinging}
                isSaving={isSaving}
                onCancel={cancelServerUrlEdit}
                onChange={updateServerUrlDraft}
                onEdit={beginServerUrlEdit}
                onPing={() => void pingServerUrlDraft()}
                onSave={() => void saveServerUrlDraft()}
                pingStatus={serverUrlPingStatus}
                serverUrl={configuredServerUrl}
                value={serverUrlDraft}
              />

              <div aria-live="polite" className={`server-status ${serverStatus}`}>
                {serverStatusLabel(serverStatus)}
              </div>

              <div className="qr-frame large">
                {configuredServerUrl && qrBinding && qrDataUrl ? (
                  <img alt="Desktop setup QR code" src={qrDataUrl} />
                ) : (
                  <div className="qr-placeholder">
                    {qrError || "Save the server URL to generate the mobile binding QR code."}
                  </div>
                )}
              </div>
            </div>
          </section>

          <footer className="footer">
            <div aria-live="polite" className={isSuccessMessage(message) ? "success" : "error"}>
              {message}
            </div>
          </footer>
        </>
      ) : null}

      {!needsServerSetup ? (
        <>
      <section className="page-header" aria-labelledby="desktop-title">
        <div>
          <p className="eyebrow">Desktop</p>
          <h1 id="desktop-title">Device bindings</h1>
          <p className="muted">
            This desktop works locally on its own. The default relay address is 122.51.133.4, and
            you can change it whenever you need to bind mobile devices through another server.
          </p>
          {isBrowserPreview ? (
            <p className="preview-banner">
              Browser preview mode: settings are stored in localStorage until the Electron app
              loads this page with its desktop bridge.
            </p>
          ) : null}
        </div>
        <div className="status-pill" aria-label="Enabled mobile bindings">
          {connectionModeLabel}
        </div>
      </section>

      <section className="section" aria-labelledby="connection-title">
        <div className="section-heading">
          <div>
            <h2 id="connection-title">Connection</h2>
            <p className="muted">
              The desktop starts with 122.51.133.4 by default. Edit the relay address when this
              desktop should bind mobile devices through another server.
            </p>
          </div>
          <div aria-live="polite" className={`server-status ${serverStatus}`}>
            {serverStatusLabel(serverStatus)}
          </div>
        </div>

        <div className="form-grid">
          <div className="field-wide">
            <ServerUrlControl
              error={serverUrlError}
              isEditing={isServerUrlEditing}
              isLoading={isLoading}
              isPinging={isPinging}
              isSaving={isSaving}
              onCancel={cancelServerUrlEdit}
              onChange={updateServerUrlDraft}
              onEdit={beginServerUrlEdit}
              onPing={() => void pingServerUrlDraft()}
              onSave={() => void saveServerUrlDraft()}
              pingStatus={serverUrlPingStatus}
              serverUrl={configuredServerUrl}
              value={serverUrlDraft}
            />
          </div>
          <label className="field">
            <span>Desktop name</span>
            <input
              autoCapitalize="none"
              autoCorrect="off"
              disabled={isLoading}
              onChange={(event) => updateConfig("desktopName", event.target.value)}
              placeholder="MacBook Pro"
              value={config.desktopName}
            />
          </label>
          <label className="field field-wide">
            <span>Default workspace path</span>
            <input
              autoCapitalize="none"
              autoCorrect="off"
              disabled={isLoading}
              onChange={(event) => updateConfig("defaultWorkspacePath", event.target.value)}
              placeholder="/Users/me/code/project"
              value={config.defaultWorkspacePath ?? ""}
            />
          </label>
        </div>
      </section>

      <section className="section" aria-labelledby="bindings-title">
        <div className="section-heading">
          <div>
            <h2 id="bindings-title">Mobile bindings</h2>
            <p className="muted">
              Manage binding tokens here. QR pairing stays available even when the server is down,
              so you can prepare mobile binding before the backend comes online.
            </p>
          </div>
          <div className="button-row">
            <button
              className="button primary"
              disabled={isLoading || isSaving || !configuredServerUrl}
              onClick={createPairingBinding}
            >
              Bind mobile by QR
            </button>
            <button className="button secondary" disabled={isLoading} onClick={addBinding}>
              Add manually
            </button>
          </div>
        </div>

        <div className="binding-list">
          {config.bindings.length === 0 ? (
            <div className="empty-state">
              <strong>No bindings yet</strong>
              <p className="muted">Add a mobile device token to receive tasks on this desktop.</p>
            </div>
          ) : (
            config.bindings.map((binding) => (
              <div className="binding-row" key={binding.id}>
                <label className="toggle">
                  <input
                    checked={binding.enabled}
                    disabled={isLoading}
                    onChange={(event) =>
                      updateBinding(binding.id, "enabled", event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>Enabled</span>
                </label>
                <label className="field compact">
                  <span>Device token</span>
                  <input
                    autoCapitalize="none"
                    autoCorrect="off"
                    disabled={isLoading}
                    onChange={(event) =>
                      updateBinding(binding.id, "deviceId", event.target.value)
                    }
                    placeholder="device-token"
                    value={binding.deviceId}
                  />
                </label>
                <label className="field compact">
                  <span>Label</span>
                  <input
                    disabled={isLoading}
                    onChange={(event) =>
                      updateBinding(binding.id, "displayName", event.target.value)
                    }
                    placeholder="iPhone"
                    value={binding.displayName ?? ""}
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={isLoading || !configuredServerUrl || !binding.deviceId.trim()}
                  onClick={() => openPairingModal(binding)}
                >
                  QR
                </button>
                <button
                  className="button danger"
                  disabled={isLoading}
                  onClick={() => removeBinding(binding.id)}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <footer className="footer">
        <div aria-live="polite" className={isSuccessMessage(message) ? "success" : "error"}>
          {message}
        </div>
        <button
          className="button primary"
          disabled={isLoading || isSaving || isServerUrlEditing}
          onClick={saveConfig}
        >
          {isSaving ? "Saving..." : "Save desktop settings"}
        </button>
      </footer>
        </>
      ) : null}

      {qrBinding && configuredServerUrl && !needsServerSetup ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="pairing-title"
            aria-modal="true"
            className="pairing-dialog"
            role="dialog"
          >
            <div className="section-heading">
              <div>
                <h2 id="pairing-title">Bind mobile</h2>
                <p className="muted">
                  {qrBinding.displayName || "Mobile"} · {config.desktopName}
                </p>
              </div>
              <button className="button secondary" onClick={closePairingModal}>
                Close
              </button>
            </div>
            <div className="pairing-body">
              <div className="qr-frame">
                {qrDataUrl ? (
                  <img alt="Mobile binding QR code" src={qrDataUrl} />
                ) : (
                  <div className="qr-placeholder">{qrError || "Generating QR..."}</div>
                )}
              </div>
              <div className="pairing-detail">
                {pendingPairingCode ? (
                  <div className="pairing-code-panel">
                    <span>Pairing code</span>
                    <strong>{pendingPairingCode}</strong>
                  </div>
                ) : null}
                <div className="field">
                  <span>Server URL</span>
                  <div className="server-url-text" title={configuredServerUrl}>
                    {configuredServerUrl}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

interface ServerUrlControlProps {
  error?: string;
  isEditing: boolean;
  isLoading: boolean;
  isPinging: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onChange: (value: string) => void;
  onEdit: () => void;
  onPing: () => void;
  onSave: () => void;
  pingStatus?: ServerHealthStatus;
  serverUrl: string;
  value: string;
}

function ServerUrlControl({
  error,
  isEditing,
  isLoading,
  isPinging,
  isSaving,
  onCancel,
  onChange,
  onEdit,
  onPing,
  onSave,
  pingStatus,
  serverUrl,
  value
}: ServerUrlControlProps) {
  const hasChanges = value.trim() !== serverUrl.trim();
  const displayUrl = serverUrl || "No server URL configured";
  const pingButtonClass = pingStatus === "available" ? "button success-button" : "button secondary";

  return (
    <div className={`server-url-control${error ? " error" : ""}`}>
      <div className="server-url-header">
        <span>Server URL</span>
      </div>

      {!isEditing ? (
        <div className="server-url-view-row">
          <div className="server-url-text" title={displayUrl}>
            {displayUrl}
          </div>
          <button className="button secondary compact-button" disabled={isLoading} onClick={onEdit}>
            Edit
          </button>
        </div>
      ) : (
        <>
          <div className="server-url-edit-row">
            <input
              aria-invalid={Boolean(error)}
              autoCapitalize="none"
              autoCorrect="off"
              disabled={isLoading || isSaving}
              onChange={(event) => onChange(event.target.value)}
              placeholder={DEFAULT_SERVER_URL}
              value={value}
            />
            <button
              className="button secondary"
              disabled={isLoading || isSaving || isPinging}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className={pingButtonClass}
              disabled={isLoading || isSaving || isPinging || !value.trim()}
              onClick={onPing}
            >
              {isPinging ? "Pinging..." : "Ping"}
            </button>
            {hasChanges ? (
              <button
                className="button primary"
                disabled={isLoading || isSaving || isPinging}
                onClick={onSave}
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            ) : null}
          </div>
          {error ? (
            <p aria-live="polite" className="field-error">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function createBinding(overrides: Partial<DesktopMobileBinding> = {}): DesktopMobileBinding {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? createBindingId(),
    deviceId: overrides.deviceId ?? createDeviceToken(),
    displayName: overrides.displayName ?? "",
    enabled: overrides.enabled ?? true,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  };
}

function addDesktopBinding(
  config: DesktopAppConfig,
  binding: DesktopMobileBinding
): DesktopAppConfig {
  return {
    ...config,
    bindings: [
      binding,
      ...config.bindings.filter(
        (currentBinding) =>
          currentBinding.id !== binding.id && currentBinding.deviceId !== binding.deviceId
      )
    ]
  };
}

function createBindingId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `binding-${Date.now()}`;
}

function createDeviceToken() {
  return `device-token-${createBindingId()}`;
}

function createPairingCode() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return String((value[0] % 900_000) + 100_000);
  }

  return String(Math.floor(100_000 + Math.random() * 900_000));
}

function formatMobileDeviceDisplayName(mobileDevice: MobileDeviceInfo) {
  const labels = [mobileDevice.deviceName, mobileDevice.modelName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const uniqueLabels = Array.from(new Set(labels));

  if (uniqueLabels.length > 0) {
    return uniqueLabels.join(" · ");
  }

  return undefined;
}

function createPairingPayload(config: DesktopAppConfig, binding: DesktopMobileBinding) {
  return createDesktopPairingPayload({
    serverUrl: config.serverUrl.trim(),
    deviceToken: binding.deviceId,
    desktopId: binding.id,
    desktopName: config.desktopName,
    createdAt: binding.createdAt
  });
}

function namespaceUrl(serverUrl: string) {
  const normalized = serverUrl.trim().replace(/\/$/, "");
  return normalized.endsWith(WS_NAMESPACE) ? normalized : `${normalized}${WS_NAMESPACE}`;
}

function serverStatusLabel(status: ServerStatus) {
  if (status === "available") {
    return "Server reachable";
  }

  if (status === "checking") {
    return "Checking server...";
  }

  return "Server unavailable";
}

function isSuccessMessage(message: string | undefined) {
  return Boolean(
    message?.startsWith("Saved") ||
      message?.startsWith("Server saved") ||
      message?.startsWith("Ping succeeded") ||
      message?.startsWith("Scan the QR code") ||
      message?.startsWith("Mobile binding completed")
  );
}

function getDesktopShell() {
  if (typeof window !== "undefined" && window.desktopShell) {
    return window.desktopShell;
  }

  return browserDesktopShell;
}

const browserDesktopShell = {
  platform: "browser",
  async getConfig() {
    if (typeof window === "undefined") {
      return emptyConfig;
    }

    const raw = window.localStorage.getItem(BROWSER_CONFIG_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(BROWSER_CONFIG_STORAGE_KEY, JSON.stringify(emptyConfig));
      return emptyConfig;
    }

    try {
      const parsed = JSON.parse(raw) as DesktopAppConfig;
      return parsed;
    } catch {
      window.localStorage.setItem(BROWSER_CONFIG_STORAGE_KEY, JSON.stringify(emptyConfig));
      return emptyConfig;
    }
  },
  async saveConfig(config: DesktopAppConfig) {
    const normalized: DesktopAppConfig = {
      ...config,
      serverPersistence: "relay_only"
    };

    if (typeof window !== "undefined") {
      window.localStorage.setItem(BROWSER_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    }

    return normalized;
  }
};
