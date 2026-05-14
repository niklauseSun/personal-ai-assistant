import type {
  AgentTaskHistory,
  AgentTaskStatus,
  ClearTaskHistoryResult,
  TaskListResponse,
  TaskOutputPage
} from "@personal-ai-assistant/shared";

export interface ListTasksParams {
  deviceId: string;
  status?: AgentTaskStatus | "all";
  prompt?: string;
  createdFrom?: string;
  createdTo?: string;
  cursor?: string;
  limit?: number;
}

export interface ListOutputsParams {
  cursor?: string;
  limit?: number;
}

function normalizeServerUrl(serverUrl: string) {
  return serverUrl.trim().replace(/\/$/, "");
}

async function getJson<ResponseBody>(url: string): Promise<ResponseBody> {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as ResponseBody;
}

export class ApiClient {
  constructor(private readonly serverUrl: string) {}

  listTasks(params: ListTasksParams) {
    const query = new URLSearchParams({
      deviceId: params.deviceId
    });

    if (params.status && params.status !== "all") {
      query.set("status", params.status);
    }

    appendOptionalQuery(query, "prompt", params.prompt);
    appendOptionalQuery(query, "createdFrom", params.createdFrom);
    appendOptionalQuery(query, "createdTo", params.createdTo);
    appendOptionalQuery(query, "cursor", params.cursor);
    appendOptionalQuery(query, "limit", params.limit?.toString());

    const url = `${normalizeServerUrl(this.serverUrl)}/tasks?${query.toString()}`;
    return getJson<TaskListResponse>(url);
  }

  getTask(taskId: string, params: ListOutputsParams = {}) {
    const query = new URLSearchParams();
    appendOptionalQuery(query, "outputCursor", params.cursor);
    appendOptionalQuery(query, "outputLimit", params.limit?.toString());
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const url = `${normalizeServerUrl(this.serverUrl)}/tasks/${encodeURIComponent(taskId)}${suffix}`;
    return getJson<AgentTaskHistory>(url);
  }

  listOutputs(taskId: string, params: ListOutputsParams = {}) {
    const query = new URLSearchParams();
    appendOptionalQuery(query, "cursor", params.cursor);
    appendOptionalQuery(query, "limit", params.limit?.toString());
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const url = `${normalizeServerUrl(this.serverUrl)}/tasks/${encodeURIComponent(
      taskId
    )}/outputs${suffix}`;
    return getJson<TaskOutputPage>(url);
  }

  async clearHistory(params: ListTasksParams) {
    const query = new URLSearchParams({
      deviceId: params.deviceId
    });

    if (params.status && params.status !== "all") {
      query.set("status", params.status);
    }

    appendOptionalQuery(query, "prompt", params.prompt);
    appendOptionalQuery(query, "createdFrom", params.createdFrom);
    appendOptionalQuery(query, "createdTo", params.createdTo);

    const response = await fetch(`${normalizeServerUrl(this.serverUrl)}/tasks/history?${query}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed with status ${response.status}`);
    }

    return (await response.json()) as ClearTaskHistoryResult;
  }
}

function appendOptionalQuery(query: URLSearchParams, key: string, value: string | undefined) {
  const normalized = value?.trim();
  if (normalized) {
    query.set(key, normalized);
  }
}
