import { app, BrowserWindow } from "electron";
import os from "node:os";
import path from "node:path";
import { CodexRunner } from "./codex-runner";
import { DesktopApiClient } from "./desktop-api-client";
import { DesktopWebSocketClient } from "./desktop-websocket-client";
import { Logger } from "./logger";
import { TaskRuntimeManager } from "./task-runtime-manager";

let desktopClient: DesktopWebSocketClient | undefined;
let runtimeManager: TaskRuntimeManager | undefined;

function startDesktopBackend() {
  const logger = new Logger("main");
  const deviceId = process.env.DESKTOP_DEVICE_ID?.trim() || os.hostname();
  const deviceName = process.env.DESKTOP_DEVICE_NAME?.trim() || os.hostname();
  const serverUrl = process.env.SERVER_WS_URL?.trim() || "http://localhost:3000";
  const workspacePath = process.env.CODEX_WORKSPACE_PATH?.trim();

  if (!workspacePath) {
    logger.warn("CODEX_WORKSPACE_PATH is not set; tasks must provide metadata.workspacePath");
  }

  desktopClient = new DesktopWebSocketClient({
    serverUrl,
    deviceId,
    deviceName,
    clientVersion: app.getVersion(),
    logger: new Logger("websocket")
  });

  runtimeManager = new TaskRuntimeManager({
    client: desktopClient,
    runner: new CodexRunner({
      logger: new Logger("codex-runner")
    }),
    defaultWorkspacePath: workspacePath,
    deviceId,
    historyClient: new DesktopApiClient(serverUrl),
    logger: new Logger("runtime")
  });

  runtimeManager.attach();
  desktopClient.connect();
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";

  if (!app.isPackaged) {
    void window.loadURL(devServerUrl);
    return;
  }

  void window.loadFile(path.join(__dirname, "../renderer/index.html"));
}

void app.whenReady().then(() => {
  startDesktopBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  runtimeManager?.cancelActiveTask();
  desktopClient?.disconnect();
});
