import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import type { DesktopAppConfig } from "@personal-ai-assistant/shared";
import { DesktopBackendManager } from "./desktop-backend-manager";
import { DesktopConfigStore } from "./desktop-config-store";
import { Logger } from "./logger";

let backendManager: DesktopBackendManager | undefined;
let configStore: DesktopConfigStore | undefined;
let currentConfig: DesktopAppConfig | undefined;

async function startDesktopBackend() {
  const logger = new Logger("main");
  configStore = new DesktopConfigStore(app.getPath("userData"));
  currentConfig = await configStore.load();

  if (!currentConfig.defaultWorkspacePath) {
    logger.warn("CODEX_WORKSPACE_PATH is not set; tasks must provide metadata.workspacePath");
  }

  backendManager = new DesktopBackendManager(app.getVersion(), new Logger("backend"));
  backendManager.start(currentConfig);
}

function registerIpcHandlers() {
  ipcMain.handle("desktop-config:get", async () => {
    if (!configStore) {
      configStore = new DesktopConfigStore(app.getPath("userData"));
    }

    currentConfig = currentConfig ?? (await configStore.load());
    return currentConfig;
  });

  ipcMain.handle("desktop-config:save", async (_event, rawConfig: unknown) => {
    if (!configStore) {
      configStore = new DesktopConfigStore(app.getPath("userData"));
    }

    const nextConfig = await configStore.save(rawConfig);
    currentConfig = nextConfig;
    backendManager?.replaceConfig(nextConfig);
    return nextConfig;
  });
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

void app.whenReady().then(async () => {
  registerIpcHandlers();
  await startDesktopBackend();
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
  backendManager?.stopAll();
});
