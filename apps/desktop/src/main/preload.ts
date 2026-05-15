import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAppConfig } from "@personal-ai-assistant/shared";

contextBridge.exposeInMainWorld("desktopShell", {
  platform: process.platform,
  getConfig: () => ipcRenderer.invoke("desktop-config:get") as Promise<DesktopAppConfig>,
  saveConfig: (config: DesktopAppConfig) =>
    ipcRenderer.invoke("desktop-config:save", config) as Promise<DesktopAppConfig>
});
