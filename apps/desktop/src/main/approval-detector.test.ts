import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApprovalDetector } from "./approval-detector";
import { cleanTerminalOutput } from "./terminal-output";

describe("ApprovalDetector", () => {
  it("detects broad approval prompts without depending on exact Codex wording", () => {
    const detector = new ApprovalDetector({
      now: () => Date.parse("2026-05-14T00:00:00.000Z")
    });

    detector.markProcessStarted();
    const detection = detector.recordOutput("Codex wants to continue. Allow? [y/n]");

    assert.equal(detection?.reason, "keyword");
    assert.match(detection?.evidence ?? "", /continue/i);
    assert.match(detection?.evidence ?? "", /allow/i);
  });

  it("suppresses duplicate detections until the pending approval is resolved", () => {
    const detector = new ApprovalDetector();

    detector.markProcessStarted(0);
    assert.equal(detector.recordOutput("please approve", 1)?.reason, "keyword");
    assert.equal(detector.recordOutput("approve again", 2), undefined);

    detector.resolvePending(3);
    assert.equal(detector.recordOutput("continue?", 4)?.reason, "keyword");
  });

  it("detects long silence after the process starts", () => {
    const detector = new ApprovalDetector({
      idleMs: 1000
    });

    detector.markProcessStarted(0);

    assert.equal(detector.checkIdle(999), undefined);
    assert.equal(detector.checkIdle(1000)?.reason, "idle");
  });
});

describe("cleanTerminalOutput", () => {
  it("strips ANSI escape sequences and normalizes carriage returns", () => {
    assert.equal(cleanTerminalOutput("\u001B[32mApprove?\u001B[0m\r\ncontinue\r"), "Approve?\ncontinue\n");
  });
});
