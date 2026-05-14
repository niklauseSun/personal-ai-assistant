import type { IPty, IPtyForkOptions } from "node-pty";
import type { OutputStream } from "@personal-ai-assistant/shared";
import { ApprovalDetector, type ApprovalDetection } from "./approval-detector";
import { Logger } from "./logger";
import { cleanTerminalOutput } from "./terminal-output";
import { assertValidWorkspacePath } from "./workspace";

export interface CodexRunRequest {
  taskId: string;
  prompt: string;
  workspacePath: string | undefined;
}

export interface CodexOutputEvent {
  stream: OutputStream;
  content: string;
  rawContent: string;
}

export interface CodexApprovalNeededEvent extends ApprovalDetection {
  content: string;
  rawContent: string;
}

export interface CodexRunResult {
  exitCode: number | null;
  signal: string | number | null;
  cancelled: boolean;
}

export interface CodexRunHandle {
  taskId: string;
  process: IPty;
  completed: Promise<CodexRunResult>;
  write: (input: string) => void;
  resolveApproval: () => void;
  kill: () => void;
}

export interface CodexRunnerOptions {
  command?: string;
  logger?: Logger;
  ptyFactory?: PtyFactory;
  approvalDetectorFactory?: () => ApprovalDetector;
  idleCheckIntervalMs?: number;
}

export interface PtyFactory {
  spawn: (command: string, args: string[], options: IPtyForkOptions) => IPty;
}

export class CodexCliNotFoundError extends Error {
  constructor() {
    super("Codex CLI was not found. Install the `codex` command or add it to PATH.");
    this.name = "CodexCliNotFoundError";
  }
}

export class CodexRunner {
  private readonly command: string;
  private readonly logger: Logger;
  private readonly ptyFactory?: PtyFactory;
  private readonly approvalDetectorFactory: () => ApprovalDetector;
  private readonly idleCheckIntervalMs: number;

  constructor(options: CodexRunnerOptions = {}) {
    this.command = options.command ?? "codex";
    this.logger = options.logger ?? new Logger("codex-runner");
    this.ptyFactory = options.ptyFactory;
    this.approvalDetectorFactory =
      options.approvalDetectorFactory ?? (() => new ApprovalDetector());
    this.idleCheckIntervalMs = options.idleCheckIntervalMs ?? 1000;
  }

  async start(
    request: CodexRunRequest,
    onOutput: (event: CodexOutputEvent) => void,
    onSpawn?: () => void,
    onApprovalNeeded?: (event: CodexApprovalNeededEvent) => void
  ): Promise<CodexRunHandle> {
    const workspacePath = await assertValidWorkspacePath(request.workspacePath);
    let cancelled = false;
    let settled = false;
    const detector = this.approvalDetectorFactory();
    detector.markProcessStarted();

    this.logger.info("starting codex process", {
      taskId: request.taskId,
      workspacePath
    });

    let child: IPty;
    try {
      child = this.getPtyFactory().spawn(this.command, [request.prompt], {
        name: "xterm-256color",
        cols: 120,
        rows: 30,
        cwd: workspacePath,
        env: {
          ...process.env,
          TERM: "xterm-256color"
        },
        encoding: "utf8"
      });
    } catch (error) {
      throw this.toStartError(error);
    }

    const disposables = [
      child.onData((data) => {
        const rawContent = typeof data === "string" ? data : String(data);
        const content = cleanTerminalOutput(rawContent);

        if (content.length > 0) {
          onOutput({
            stream: "stdout",
            content,
            rawContent
          });
        }

        const detection = detector.recordOutput(content);
        if (detection) {
          onApprovalNeeded?.({
            ...detection,
            content,
            rawContent
          });
        }
      })
    ];

    const idleTimer = setInterval(() => {
      const detection = detector.checkIdle();
      if (detection) {
        onApprovalNeeded?.({
          ...detection,
          content: "",
          rawContent: ""
        });
      }
    }, this.idleCheckIntervalMs);
    idleTimer.unref?.();

    this.logger.info("codex pty spawned", {
      taskId: request.taskId,
      pid: child.pid
    });
    onSpawn?.();

    const completed = new Promise<CodexRunResult>((resolve) => {
      disposables.push(
        child.onExit((event) => {
          if (settled) {
            return;
          }

          settled = true;
          clearInterval(idleTimer);
          for (const disposable of disposables) {
            disposable.dispose();
          }

          this.logger.info("codex pty exited", {
            taskId: request.taskId,
            exitCode: event.exitCode,
            signal: event.signal,
            cancelled
          });

          resolve({
            exitCode: event.exitCode,
            signal: event.signal ?? null,
            cancelled
          });
        })
      );
    });

    return {
      taskId: request.taskId,
      process: child,
      completed,
      write: (input) => {
        this.logger.info("writing to codex pty", {
          taskId: request.taskId,
          bytes: input.length
        });
        child.write(input);
      },
      resolveApproval: () => {
        detector.resolvePending();
      },
      kill: () => {
        cancelled = true;
        if (settled) {
          return;
        }

        this.logger.warn("killing codex pty", {
          taskId: request.taskId,
          pid: child.pid
        });
        child.kill();
      }
    };
  }

  private getPtyFactory() {
    if (this.ptyFactory) {
      return this.ptyFactory;
    }

    const nodePty = require("node-pty") as typeof import("node-pty");
    return {
      spawn: nodePty.spawn
    };
  }

  private toStartError(error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return new CodexCliNotFoundError();
    }

    if (error instanceof Error && /not found|ENOENT/i.test(error.message)) {
      return new CodexCliNotFoundError();
    }

    return error;
  }
}
