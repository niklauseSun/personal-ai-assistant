import type { DesktopAppConfig } from "@personal-ai-assistant/shared";

declare global {
  interface Window {
    desktopShell: {
      platform: string;
      getConfig: () => Promise<DesktopAppConfig>;
      saveConfig: (config: DesktopAppConfig) => Promise<DesktopAppConfig>;
    };
  }
}

export {};
