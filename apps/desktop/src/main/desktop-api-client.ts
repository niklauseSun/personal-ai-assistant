import type { AgentTask, TaskListResponse } from "@personal-ai-assistant/shared";

export interface DesktopTaskHistoryClient {
  listRecoverableTasks(deviceId: string): Promise<AgentTask[]>;
}

export class DesktopApiClient implements DesktopTaskHistoryClient {
  constructor(private readonly serverUrl: string) {}

  async listRecoverableTasks(deviceId: string): Promise<AgentTask[]> {
    const url = `${this.baseUrl()}/tasks/recoverable?deviceId=${encodeURIComponent(deviceId)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch recoverable tasks: ${response.status}`);
    }

    const payload = (await response.json()) as AgentTask[] | TaskListResponse;
    return Array.isArray(payload) ? payload : payload.items;
  }

  private baseUrl() {
    return this.serverUrl.trim().replace(/\/tasks\/?$/, "").replace(/\/$/, "");
  }
}
