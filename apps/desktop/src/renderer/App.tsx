import type { DesktopAppConfig, DesktopMobileBinding } from "@personal-ai-assistant/shared";
import { useEffect, useMemo, useState } from "react";

const emptyConfig: DesktopAppConfig = {
  serverUrl: "http://localhost:3000",
  desktopName: "Desktop",
  serverPersistence: "persist",
  bindings: []
};

export function App() {
  const [config, setConfig] = useState<DesktopAppConfig>(emptyConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const enabledCount = useMemo(
    () => config.bindings.filter((binding) => binding.enabled).length,
    [config.bindings]
  );

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

  const removeBinding = (bindingId: string) => {
    setConfig((current) => ({
      ...current,
      bindings: current.bindings.filter((binding) => binding.id !== bindingId)
    }));
  };

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      const savedConfig = await window.desktopShell.saveConfig(config);
      setConfig(savedConfig);
      setMessage("Saved. Desktop WebSocket bindings were reloaded.");
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
          <fieldset className="field field-wide">
            <legend>Server history</legend>
            <div className="segmented-control">
              <label className={config.serverPersistence === "persist" ? "segment active" : "segment"}>
                <input
                  checked={config.serverPersistence === "persist"}
                  disabled={isLoading}
                  name="serverPersistence"
                  onChange={() => updateConfig("serverPersistence", "persist")}
                  type="radio"
                />
                <span>Save history on server</span>
              </label>
              <label
                className={config.serverPersistence === "relay_only" ? "segment active" : "segment"}
              >
                <input
                  checked={config.serverPersistence === "relay_only"}
                  disabled={isLoading}
                  name="serverPersistence"
                  onChange={() => updateConfig("serverPersistence", "relay_only")}
                  type="radio"
                />
                <span>Relay only</span>
              </label>
            </div>
            <p className="help-text">
              Relay only keeps task, output, and approval history out of the server database.
            </p>
          </fieldset>
        </div>
      </section>

      <section className="section" aria-labelledby="bindings-title">
        <div className="section-heading">
          <div>
            <h2 id="bindings-title">Mobile bindings</h2>
            <p className="muted">The mobile app must use the same deviceId as a row below.</p>
          </div>
          <button className="button secondary" disabled={isLoading} onClick={addBinding}>
            Add mobile
          </button>
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
                  <span>Mobile deviceId</span>
                  <input
                    autoCapitalize="none"
                    autoCorrect="off"
                    disabled={isLoading}
                    onChange={(event) =>
                      updateBinding(binding.id, "deviceId", event.target.value)
                    }
                    placeholder="my-phone"
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
    </main>
  );
}

function createBindingId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `binding-${Date.now()}`;
}
