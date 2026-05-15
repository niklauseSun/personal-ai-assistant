import type { DesktopAppConfig, DesktopMobileBinding } from "@personal-ai-assistant/shared";
import { CodexRunner } from "./codex-runner";
import { DesktopWebSocketClient } from "./desktop-websocket-client";
import { Logger } from "./logger";
import { TaskRuntimeManager } from "./task-runtime-manager";

interface DesktopBindingRuntime {
  client: DesktopWebSocketClient;
  runtimeManager: TaskRuntimeManager;
}

export class DesktopBackendManager {
  private readonly logger: Logger;
  private readonly runtimes = new Map<string, DesktopBindingRuntime>();

  constructor(private readonly appVersion: string, logger?: Logger) {
    this.logger = logger ?? new Logger("backend");
  }

  replaceConfig(config: DesktopAppConfig) {
    this.stopAll();
    this.start(config);
  }

  start(config: DesktopAppConfig) {
    const enabledBindings = config.bindings.filter((binding) => binding.enabled);
    if (enabledBindings.length === 0) {
      this.logger.warn("no enabled mobile bindings; desktop will not receive tasks");
      return;
    }

    for (const binding of enabledBindings) {
      this.startBinding(config, binding);
    }
  }

  cancelActiveTasks() {
    for (const runtime of this.runtimes.values()) {
      runtime.runtimeManager.cancelActiveTask();
    }
  }

  stopAll() {
    for (const [bindingId, runtime] of this.runtimes) {
      this.logger.info("stopping desktop binding", {
        bindingId
      });
      runtime.runtimeManager.cancelActiveTask();
      runtime.client.disconnect();
    }

    this.runtimes.clear();
  }

  private startBinding(config: DesktopAppConfig, binding: DesktopMobileBinding) {
    if (this.runtimes.has(binding.id)) {
      return;
    }

    const loggerContext = `binding:${binding.deviceId}`;
    const client = new DesktopWebSocketClient({
      serverUrl: config.serverUrl,
      deviceId: binding.deviceId,
      desktopId: binding.id,
      deviceName: this.bindingDeviceName(config, binding),
      clientVersion: this.appVersion,
      serverPersistence: "relay_only",
      logger: new Logger(`${loggerContext}:websocket`)
    });
    const runtimeManager = new TaskRuntimeManager({
      client,
      runner: new CodexRunner({
        logger: new Logger(`${loggerContext}:codex-runner`)
      }),
      defaultWorkspacePath: config.defaultWorkspacePath,
      deviceId: binding.deviceId,
      logger: new Logger(`${loggerContext}:runtime`)
    });

    runtimeManager.attach();
    client.connect();
    this.runtimes.set(binding.id, {
      client,
      runtimeManager
    });

    this.logger.info("started desktop binding", {
      bindingId: binding.id,
      deviceId: binding.deviceId
    });
  }

  private bindingDeviceName(config: DesktopAppConfig, binding: DesktopMobileBinding) {
    return binding.displayName
      ? `${config.desktopName} / ${binding.displayName}`
      : config.desktopName;
  }
}
