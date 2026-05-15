import type { DesktopAppConfig, DesktopMobileBinding } from "@personal-ai-assistant/shared";
import { createDesktopPairingPayload } from "@personal-ai-assistant/shared";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

const emptyConfig: DesktopAppConfig = {
  serverUrl: "http://localhost:3000",
  desktopName: "Desktop",
  serverPersistence: "relay_only",
  bindings: []
};

export function App() {
  const [config, setConfig] = useState<DesktopAppConfig>(emptyConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [qrBindingId, setQrBindingId] = useState<string>();
  const [qrDataUrl, setQrDataUrl] = useState<string>();
  const [qrError, setQrError] = useState<string>();
  const enabledCount = useMemo(
    () => config.bindings.filter((binding) => binding.enabled).length,
    [config.bindings]
  );
  const qrBinding = useMemo(
    () => config.bindings.find((binding) => binding.id === qrBindingId),
    [config.bindings, qrBindingId]
  );

  useEffect(() => {
    let isMounted = true;

    if (!qrBinding) {
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
  }, [config, qrBinding]);

  useEffect(() => {
    let isMounted = true;

    window.desktopShell
      .getConfig()
      .then((nextConfig) => {
        if (isMounted) {
          setConfig(nextConfig);
          setMessage(undefined);
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
    const now = new Date().toISOString();
    setConfig((current) => ({
      ...current,
      bindings: [
        ...current.bindings,
        {
          id: createBindingId(),
          deviceId: "",
          displayName: "",
          enabled: true,
          createdAt: now,
          updatedAt: now
        }
      ]
    }));
  };

  const createPairingBinding = async () => {
    const now = new Date().toISOString();
    const binding: DesktopMobileBinding = {
      id: createBindingId(),
      deviceId: createDeviceToken(),
      displayName: "Mobile",
      enabled: true,
      createdAt: now,
      updatedAt: now
    };
    const nextConfig = {
      ...config,
      serverPersistence: "relay_only" as const,
      bindings: [...config.bindings, binding]
    };

    setConfig(nextConfig);
    setQrBindingId(binding.id);
    await persistConfig(nextConfig, "Binding token created. Scan the QR code from mobile.");
  };

  const removeBinding = (bindingId: string) => {
    setConfig((current) => ({
      ...current,
      bindings: current.bindings.filter((binding) => binding.id !== bindingId)
    }));
    if (qrBindingId === bindingId) {
      setQrBindingId(undefined);
    }
  };

  const saveConfig = async () => {
    await persistConfig(
      {
        ...config,
        serverPersistence: "relay_only"
      },
      "Saved. Desktop WebSocket bindings were reloaded."
    );
  };

  const persistConfig = async (nextConfig: DesktopAppConfig, successMessage: string) => {
    setIsSaving(true);
    try {
      const savedConfig = await window.desktopShell.saveConfig({
        ...nextConfig,
        serverPersistence: "relay_only"
      });
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
      <section className="page-header" aria-labelledby="desktop-title">
        <div>
          <p className="eyebrow">Desktop</p>
          <h1 id="desktop-title">Device bindings</h1>
          <p className="muted">
            Bind this desktop to one or more mobile device IDs. Each enabled binding opens a
            desktop WebSocket connection for that mobile device.
          </p>
        </div>
        <div className="status-pill" aria-label="Enabled mobile bindings">
          {enabledCount} enabled
        </div>
      </section>

      <section className="section" aria-labelledby="connection-title">
        <div className="section-heading">
          <div>
            <h2 id="connection-title">Connection</h2>
            <p className="muted">These settings apply to every enabled mobile binding.</p>
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
              placeholder="http://localhost:3000"
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
            Create a token for each phone, then scan its QR code in the mobile app.
          </p>
          </div>
          <div className="button-row">
            <button
              className="button primary"
              disabled={isLoading || isSaving}
              onClick={() => void createPairingBinding()}
            >
              Bind mobile
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
              <p className="muted">Add a mobile deviceId to receive tasks on this desktop.</p>
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
                  disabled={isLoading || !binding.deviceId.trim()}
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
          {isSaving ? "Saving..." : "Save and reload bindings"}
        </button>
      </footer>

      {qrBinding ? (
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
                <p className="muted">{qrBinding.displayName || "Mobile"} · {config.desktopName}</p>
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
                  <input readOnly value={config.serverUrl} />
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
    serverUrl: config.serverUrl,
    deviceToken: binding.deviceId,
    desktopId: binding.id,
    desktopName: config.desktopName,
    createdAt: binding.createdAt
  });
}
