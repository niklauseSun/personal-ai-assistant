import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  WorkspacePathError,
  assertValidWorkspacePath,
  getWorkspacePathFromTaskMetadata,
  resolveWorkspacePath
} from "./workspace";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("workspace helpers", () => {
  it("uses task metadata workspacePath before the default", () => {
    assert.equal(
      resolveWorkspacePath("/task/workspace", "/default/workspace"),
      "/task/workspace"
    );
  });

  it("extracts workspacePath only when metadata contains a string", () => {
    assert.equal(getWorkspacePathFromTaskMetadata({ workspacePath: "/repo" }), "/repo");
    assert.equal(getWorkspacePathFromTaskMetadata({ workspacePath: 42 }), undefined);
  });

  it("rejects an empty workspacePath", async () => {
    await assert.rejects(() => assertValidWorkspacePath(" "), WorkspacePathError);
  });

  it("rejects a missing workspacePath", async () => {
    await assert.rejects(() => assertValidWorkspacePath("/missing/workspace"), WorkspacePathError);
  });

  it("rejects a file workspacePath", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "desktop-workspace-"));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "file.txt");
    await writeFile(filePath, "not a directory");

    await assert.rejects(() => assertValidWorkspacePath(filePath), WorkspacePathError);
  });

  it("accepts an existing directory workspacePath", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "desktop-workspace-"));
    tempDirs.push(tempDir);

    assert.equal(await assertValidWorkspacePath(tempDir), tempDir);
  });
});
