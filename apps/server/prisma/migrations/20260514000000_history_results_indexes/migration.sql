-- Persist approval result payloads separately from generic task events.
CREATE TABLE "ApprovalResult" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskId" TEXT NOT NULL,
  "approvalRequestId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "reason" TEXT,
  "resolvedByDeviceId" TEXT NOT NULL,
  "resolvedAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ApprovalResult_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApprovalResult_approvalRequestId_key" ON "ApprovalResult"("approvalRequestId");
CREATE INDEX "ApprovalResult_taskId_resolvedAt_idx" ON "ApprovalResult"("taskId", "resolvedAt");
CREATE INDEX "ApprovalResult_status_idx" ON "ApprovalResult"("status");
CREATE INDEX "AgentTask_deviceId_status_createdAt_idx" ON "AgentTask"("deviceId", "status", "createdAt");
