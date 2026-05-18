import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { DesktopAppConfig } from "@personal-ai-assistant/shared";
import { DesktopConfigStore, normalizeConfig } from "./desktop-config-store";

const fallback: DesktopAppConfig = {
  serverUrl: "http://localhost:3000",
  desktopName: "desk-1",
  serverPersistence: "persist",
  bindings: []
};

describe("DesktopConfigStore", () => {
  it("normalizes duplicate and empty mobile bindings", () => {
    const config = normalizeConfig(
      {
        serverUrl: " http://server.local ",
        desktopName: " Workstation ",
        serverPersistence: "relay_only",
        defaultWorkspacePath: " /tmp/project ",
        bindings: [
          {
            id: "binding-1",
            deviceId: " mobile-1 ",
            displayName: " Phone ",
            enabled: true,
            createdAt: "2026-05-15T00:00:00.000Z"
          },
          {
            id: "duplicate",
            deviceId: "mobile-1",
            enabled: true
          },
          {
            id: "empty",
            deviceId: " "
          }
        ]
      },
      fallback
    );

    assert.equal(config.serverUrl, "http://server.local");
    assert.equal(config.desktopName, "Workstation");
    assert.equal(config.serverPersistence, "relay_only");
    assert.equal(config.defaultWorkspacePath, "/tmp/project");
    assert.equal(config.bindings.length, 1);
    assert.equal(config.bindings[0].deviceId, "mobile-1");
    assert.equal(config.bindings[0].displayName, "Phone");
  });

  it("persists desktop config as JSON", async () => {
    const userDataPath = await mkdtemp(path.join(os.tmpdir(), "desktop-config-store-"));
    const store = new DesktopConfigStore(userDataPath);
    const saved = await store.save({
      serverUrl: "http://localhost:3000",
      desktopName: "Desk",
      serverPersistence: "relay_only",
      bindings: [
        {
          deviceId: "mobile-a",
          enabled: true
        },
        {
          deviceId: "mobile-b",
          enabled: false
        }
      ]
    });

    const raw = await readFile(path.join(userDataPath, "desktop-config.json"), "utf8");
    const loaded = JSON.parse(raw) as DesktopAppConfig;

    assert.equal(saved.bindings.length, 2);
    assert.equal(loaded.serverPersistence, "relay_only");
    assert.equal(loaded.bindings[0].deviceId, "mobile-a");
    assert.equal(loaded.bindings[1].enabled, false);
  });

  it("preserves an intentionally empty server URL when the user clears it", () => {
    const config = normalizeConfig(
      {
        serverUrl: "   ",
        desktopName: "Desk"
      },
      fallback
    );

    assert.equal(config.serverUrl, "");
    assert.equal(config.desktopName, "Desk");
  });
});
