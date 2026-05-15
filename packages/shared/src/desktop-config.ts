export type ServerPersistenceMode = "persist" | "relay_only";

export interface DesktopMobileBinding {
  id: string;
  deviceId: string;
  displayName?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DesktopAppConfig {
  serverUrl: string;
  desktopName: string;
  serverPersistence: ServerPersistenceMode;
  defaultWorkspacePath?: string;
  bindings: DesktopMobileBinding[];
}
