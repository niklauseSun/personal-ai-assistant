import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHealthUrl, pingServerHealth } from "./server-health";

describe("buildHealthUrl", () => {
  it("normalizes a configured server URL to its health endpoint", () => {
    assert.equal(buildHealthUrl(" http://122.51.133.4:3000/ "), "http://122.51.133.4:3000/health");
  });
});

describe("pingServerHealth", () => {
  it("reports an available server when health responds with ok", async () => {
    const result = await pingServerHealth("http://server.local", {
      fetcher: async (url) => {
        assert.equal(url, "http://server.local/health");
        return new Response("ok", { status: 200 });
      },
      timeoutMs: 100
    });

    assert.equal(result.status, "available");
  });

  it("reports an unavailable server when health does not respond before the timeout", async () => {
    const result = await pingServerHealth("http://server.local", {
      fetcher: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
      timeoutMs: 1
    });

    assert.equal(result.status, "unavailable");
    assert.match(result.message, /timed out/i);
  });
});
