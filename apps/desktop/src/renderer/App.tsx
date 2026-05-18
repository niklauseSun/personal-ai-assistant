import type { DesktopAppConfig, DesktopMobileBinding } from "@personal-ai-assistant/shared";
import { createDesktopPairingPayload } from "@personal-ai-assistant/shared";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

const BROWSER_CONFIG_STORAGE_KEY = "personal-ai-assistant.desktop-config";
const DEFAULT_SERVER_URL = "http://localhost:3000";

const emptyConfig: DesktopAppConfig = {
  serverUrl: DEFAULT_SERVER_URL,
  desktopName: "Desktop",
  serverPersistence: "relay_only",
  bindings: []
};

export function App() {
  const isBrowserPreview = typeof window !== "undefined" && !window.desktopShell;
  const [config, setConfig] = useState<DesktopAppConfig>(emptyConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [qrBindingId, setQrBindingId] = useState<string>();
  const [qrDataUrl, setQrDataUrl] = useState<string>();
  const [qrError, setQrError] = useState<string>();
  const [serverStatus, setServerStatus] = useState<"checking" | "available" | "unavailable">(
    "checking"
  );
  const configuredServerUrl = config.serverUrl.trim();
  const enabledCount = useMemo(
    () => config.bindings.filter((binding) => binding.enabled).length,
    [config.bindings]
  );
  const needsServerSetup = configuredServerUrl.length === 0 || serverStatus === "unavailable";
  const connectionModeLabel = needsServerSetup
    ? configuredServerUrl
      ? "Server unavailable"
      : "Server not configured"
    : `${enabledCount} enabled`;
  const primaryBinding = useMemo(
    () => config.bindings[0],
    [config.bindings]
  );
  const qrBinding = useMemo(
    () => config.bindings.find((binding) => binding.id === qrBindingId),
    [config.bindings, qrBindingId]
  );
  const setupBinding = primaryBinding;

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
    let isMounted = true;
    const controller = new AbortController();

    if (!configuredServerUrl) {
      setServerStatus("unavailable");
      return () => {
        controller.abort();
      };
    }

    setServerStatus("checking");

    fetch(`${configuredServerUrl.replace(/\/$/, "")}/health`, {
      signal: controller.signal
    })
      .then((response) => {
        if (!isMounted) {
          return;
        }

        setServerStatus(response.ok ? "available" : "unavailable");
      })
      .catch(() => {
        if (!isMounted || controller.signal.aborted) {
          return;
        }

        setServerStatus("unavailable");
      });

    return () => {
      isMounted = false;
      controller.abort();
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

        const hydratedConfig = ensureAtLeastOneBinding(nextConfig);
        setConfig(hydratedConfig);
        setMessage(undefined);
        if (hydratedConfig.bindings[0]) {
          setQrBindingId(hydratedConfig.bindings[0].id);
        }
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

  const createPairingBinding = async () => {
    const binding = createBinding({
      displayName: "Mobile"
    });
    const nextConfig = {
      ...config,
      serverPersistence: "relay_only" as const,
      bindings: [...config.bindings, binding]
    };

    setConfig(nextConfig);
    setQrBindingId(binding.id);
    await persistConfig(nextConfig, "Binding token created. Scan the QR code from mobile.");
  };

  const saveServerSetup = async () => {
    const serverUrl = config.serverUrl.trim();
    if (!serverUrl) {
      setMessage("Enter a server URL to enable mobile relay and QR pairing.");
      return;
    }

    const hydratedConfig = ensureAtLeastOneBinding({
      ...config,
      serverUrl
    });
    setQrBindingId(hydratedConfig.bindings[0].id);
    await persistConfig(hydratedConfig, "Server saved. Mobile relay is ready for QR pairing.");
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

  const resetServerUrl = () => {
    setConfig((current) => ({
      ...current,
      serverUrl: DEFAULT_SERVER_URL
    }));
    setMessage(`Server URL reset to ${DEFAULT_SERVER_URL}.`);
  };

  const persistConfig = async (nextConfig: DesktopAppConfig, successMessage: string) => {
    setIsSaving(true);
    try {
      const savedConfig = ensureAtLeastOneBinding(
        await getDesktopShell().saveConfig({
          ...nextConfig,
          serverUrl: nextConfig.serverUrl.trim(),
          serverPersistence: "relay_only"
        })
      );
      setConfig(savedConfig);
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
              <label className="field">
                <span>Server URL</span>
                <input
                  autoCapitalize="none"
                  autoCorrect="off"
                  disabled={isLoading}
                  onChange={(event) => updateConfig("serverUrl", event.target.value)}
                  placeholder={DEFAULT_SERVER_URL}
                  value={config.serverUrl}
                />
              </label>

              <div className="button-row">
                <button
                  className="button secondary"
                  disabled={isLoading || isSaving}
                  onClick={resetServerUrl}
                >
                  Reset
                </button>
                <button
                  className="button primary"
                  disabled={isLoading || isSaving}
                  onClick={() => void saveServerSetup()}
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
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
            <div aria-live="polite" className={message?.startsWith("Saved") ? "success" : "error"}>
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
            This desktop works locally on its own. The default relay address is localhost, and you
            can change it whenever you need to bind mobile devices through another server.
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
              The desktop starts with localhost by default. You can edit the relay address or reset
              it back to localhost at any time.
            </p>
          </div>
          <div className={`server-status ${serverStatus}`}>
            {serverStatus === "available"
              ? "Server reachable"
              : serverStatus === "checking"
                ? "Checking server..."
                : "Server unavailable"}
          </div>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Server URL</span>
            <input
              autoCapitalize="none"
              autoCorrect="off"
              disabled={isLoading}
              onChange={(event) => updateConfig("serverUrl", event.target.value)}
              placeholder={DEFAULT_SERVER_URL}
              value={config.serverUrl}
            />
          </label>
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
          <div className="field action-field">
            <span>Relay address</span>
            <button className="button secondary" disabled={isLoading || isSaving} onClick={resetServerUrl}>
              Reset to localhost
            </button>
          </div>
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
              onClick={() => void createPairingBinding()}
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
                  onClick={() => setQrBindingId(binding.id)}
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
        <div aria-live="polite" className={message?.startsWith("Saved") ? "success" : "error"}>
          {message}
        </div>
        <button className="button primary" disabled={isLoading || isSaving} onClick={saveConfig}>
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
              <button className="button secondary" onClick={() => setQrBindingId(undefined)}>
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
                <label className="field">
                  <span>Server URL</span>
                  <input readOnly value={configuredServerUrl} />
                </label>
                <label className="field">
                  <span>Desktop ID</span>
                  <input readOnly value={qrBinding.id} />
                </label>
                <label className="field">
                  <span>Device token</span>
                  <input readOnly value={qrBinding.deviceId} />
                </label>
                <label className="field">
                  <span>Manual payload</span>
                  <textarea readOnly value={JSON.stringify(createPairingPayload(config, qrBinding))} />
                </label>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
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

function ensureAtLeastOneBinding(config: DesktopAppConfig): DesktopAppConfig {
  if (config.bindings.length > 0) {
    return config;
  }

  return {
    ...config,
    bindings: [createBinding({ displayName: "Mobile" })]
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

function createPairingPayload(config: DesktopAppConfig, binding: DesktopMobileBinding) {
  return createDesktopPairingPayload({
    serverUrl: config.serverUrl.trim(),
    deviceToken: binding.deviceId,
    desktopId: binding.id,
    desktopName: config.desktopName,
    createdAt: binding.createdAt
  });
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
      const initialConfig = ensureAtLeastOneBinding(emptyConfig);
      window.localStorage.setItem(BROWSER_CONFIG_STORAGE_KEY, JSON.stringify(initialConfig));
      return initialConfig;
    }

    try {
      const parsed = JSON.parse(raw) as DesktopAppConfig;
      return ensureAtLeastOneBinding(parsed);
    } catch {
      const initialConfig = ensureAtLeastOneBinding(emptyConfig);
      window.localStorage.setItem(BROWSER_CONFIG_STORAGE_KEY, JSON.stringify(initialConfig));
      return initialConfig;
    }
  },
  async saveConfig(config: DesktopAppConfig) {
    const normalized = ensureAtLeastOneBinding({
      ...config,
      serverPersistence: "relay_only"
    });

    if (typeof window !== "undefined") {
      window.localStorage.setItem(BROWSER_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    }

    return normalized;
  }
};
