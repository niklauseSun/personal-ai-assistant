import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { IDisposable, IPty } from "node-pty";
import { CodexCliNotFoundError, CodexRunner } from "./codex-runner";
import { WorkspacePathError } from "./workspace";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

class FakePty implements IPty {
  readonly pid = 1234;
  readonly cols = 120;
  readonly rows = 30;
  readonly process = "codex";
  handleFlowControl = false;
  readonly writes: Array<string | Buffer> = [];
  killedWith?: string;
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>();

  readonly onData = (listener: (data: string) => void): IDisposable => {
    this.dataListeners.add(listener);
    return {
      dispose: () => this.dataListeners.delete(listener)
    };
  };

  readonly onExit = (listener: (event: { exitCode: number; signal?: number }) => void): IDisposable => {
    this.exitListeners.add(listener);
    return {
      dispose: () => this.exitListeners.delete(listener)
    };
  };

  resize() {
    return undefined;
  }

  clear() {
    return undefined;
  }

  write(data: string | Buffer) {
    this.writes.push(data);
  }

  kill(signal?: string) {
    this.killedWith = signal ?? "SIGHUP";
  }

  pause() {
    return undefined;
  }

  resume() {
    return undefined;
  }

  emitData(data: string) {
    for (const listener of this.dataListeners) {
      listener(data);
    }
  }
}

describe("CodexRunner", () => {
  it("rejects an empty workspacePath before spawning codex", async () => {
    const runner = new CodexRunner();

    await assert.rejects(
      () =>
        runner.start(
          {
            taskId: "task-1",
            prompt: "hello",
            workspacePath: ""
          },
          () => undefined
        ),
      WorkspacePathError
    );
  });

  it("returns a clear error when the codex command is not installed", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "desktop-codex-runner-"));
    tempDirs.push(tempDir);
    const runner = new CodexRunner({
      command: "codex-command-that-should-not-exist",
      ptyFactory: {
        spawn: () => {
          throw Object.assign(new Error("spawn ENOENT"), {
            code: "ENOENT"
          });
        }
      }
    });

    await assert.rejects(
      () =>
        runner.start(
          {
            taskId: "task-1",
            prompt: "hello",
            workspacePath: tempDir
          },
          () => undefined
        ),
      CodexCliNotFoundError
    );
  });

  it("captures pty output, cleans ANSI, detects approvals, and writes input", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "desktop-codex-runner-"));
    tempDirs.push(tempDir);
    const fakePty = new FakePty();
    const outputs: string[] = [];
    const rawOutputs: string[] = [];
    const approvals: string[] = [];
    let spawned = false;

    const runner = new CodexRunner({
      ptyFactory: {
        spawn: () => fakePty
      },
      idleCheckIntervalMs: 100000
    });

    const handle = await runner.start(
      {
        taskId: "task-1",
        prompt: "hello",
        workspacePath: tempDir
      },
      (output) => {
        outputs.push(output.content);
        rawOutputs.push(output.rawContent);
      },
      () => {
        spawned = true;
      },
      (approval) => {
        approvals.push(approval.reason);
      }
    );

    fakePty.emitData("\u001B[32mAllow Codex to continue? [y/n]\u001B[0m\r\n");

    assert.equal(spawned, true);
    assert.deepEqual(outputs, ["Allow Codex to continue? [y/n]\n"]);
    assert.match(rawOutputs[0], /\u001B\[32m/);
    assert.deepEqual(approvals, ["keyword"]);

    handle.write("y\r");
    assert.equal(fakePty.writes[0], "y\r");

    handle.resolveApproval();
    fakePty.emitData("continue?\n");
    assert.deepEqual(approvals, ["keyword", "keyword"]);

    handle.kill();
    assert.equal(fakePty.killedWith, "SIGHUP");
  });
});
