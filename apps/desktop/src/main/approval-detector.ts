export type ApprovalDetectionReason = "keyword" | "idle";

export interface ApprovalDetection {
  reason: ApprovalDetectionReason;
  evidence: string;
  detectedAt: string;
}

export interface ApprovalDetectorOptions {
  idleMs?: number;
  maxBufferLength?: number;
  now?: () => number;
}

const DEFAULT_IDLE_MS = 30000;
const DEFAULT_MAX_BUFFER_LENGTH = 4000;
const KEYWORD_PATTERNS = [
  /\bapprove\b/i,
  /\ballow\b/i,
  /\bcontinue\b/i,
  /\by\s*\/\s*n\b/i,
  /\[\s*y\s*\/\s*n\s*\]/i,
  /\(\s*y\s*\/\s*n\s*\)/i
];

export class ApprovalDetector {
  private readonly idleMs: number;
  private readonly maxBufferLength: number;
  private readonly now: () => number;
  private buffer = "";
  private lastOutputAt?: number;
  private startedAt?: number;
  private pending = false;

  constructor(options: ApprovalDetectorOptions = {}) {
    this.idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
    this.maxBufferLength = options.maxBufferLength ?? DEFAULT_MAX_BUFFER_LENGTH;
    this.now = options.now ?? Date.now;
  }

  markProcessStarted(timestamp = this.now()) {
    this.startedAt = timestamp;
    this.lastOutputAt = timestamp;
  }

  recordOutput(output: string, timestamp = this.now()): ApprovalDetection | undefined {
    this.lastOutputAt = timestamp;
    this.buffer = `${this.buffer}${output}`.slice(-this.maxBufferLength);

    if (this.pending) {
      return undefined;
    }

    if (KEYWORD_PATTERNS.some((pattern) => pattern.test(this.buffer))) {
      return this.markPending("keyword", this.evidenceFromBuffer(), timestamp);
    }

    return undefined;
  }

  checkIdle(timestamp = this.now()): ApprovalDetection | undefined {
    if (this.pending) {
      return undefined;
    }

    const lastActivityAt = this.lastOutputAt ?? this.startedAt;
    if (lastActivityAt === undefined || timestamp - lastActivityAt < this.idleMs) {
      return undefined;
    }

    return this.markPending("idle", `No terminal output for ${this.idleMs}ms.`, timestamp);
  }

  resolvePending(timestamp = this.now()) {
    this.pending = false;
    this.buffer = "";
    this.lastOutputAt = timestamp;
  }

  hasPendingApproval() {
    return this.pending;
  }

  private markPending(
    reason: ApprovalDetectionReason,
    evidence: string,
    timestamp: number
  ): ApprovalDetection {
    this.pending = true;
    return {
      reason,
      evidence,
      detectedAt: new Date(timestamp).toISOString()
    };
  }

  private evidenceFromBuffer() {
    return this.buffer.replace(/\s+/g, " ").trim().slice(-500);
  }
}
