import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { AgentTask, TaskListResponse } from "@personal-ai-assistant/shared";
import { DesktopApiClient } from "./desktop-api-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("DesktopApiClient", () => {
  it("reads recoverable tasks from the current server array response", async () => {
    const task = recoverableTask();
    mockJsonResponse([task]);

    const client = new DesktopApiClient("http://localhost:3000");
    const tasks = await client.listRecoverableTasks("device-1");

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].id, "task-1");
  });

  it("also accepts a paginated recoverable task response", async () => {
    const task = recoverableTask();
    const response: TaskListResponse = {
      items: [task],
      hasMore: false
    };
    mockJsonResponse(response);

    const client = new DesktopApiClient("http://localhost:3000/tasks");
    const tasks = await client.listRecoverableTasks("device-1");

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].status, "waiting_approval");
  });
});

function mockJsonResponse(payload: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    })) as typeof fetch;
}

function recoverableTask(): AgentTask {
  return {
    id: "task-1",
    prompt: "Resume history",
    status: "waiting_approval",
    createdByDeviceId: "device-1",
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z"
  };
}
