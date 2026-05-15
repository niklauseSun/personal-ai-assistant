CREATE TABLE "DeviceSession" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "clientType" TEXT NOT NULL,
    "deviceName" TEXT,
    "socketId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'online',
    "clientVersion" TEXT,
    "metadataJson" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "createdByConnectionId" TEXT,
    "assignedDesktopDeviceId" TEXT,
    "metadataJson" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "exitCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutputChunk" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stream" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutputChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'medium',
    "message" TEXT,
    "command" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByDeviceId" TEXT,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalResult" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "resolvedByDeviceId" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceSession_deviceId_clientType_key" ON "DeviceSession"("deviceId", "clientType");
CREATE INDEX "DeviceSession_deviceId_idx" ON "DeviceSession"("deviceId");
CREATE INDEX "DeviceSession_socketId_idx" ON "DeviceSession"("socketId");

CREATE INDEX "AgentTask_deviceId_createdAt_idx" ON "AgentTask"("deviceId", "createdAt");
CREATE INDEX "AgentTask_deviceId_status_createdAt_idx" ON "AgentTask"("deviceId", "status", "createdAt");
CREATE INDEX "AgentTask_status_idx" ON "AgentTask"("status");

CREATE UNIQUE INDEX "OutputChunk_taskId_sequence_key" ON "OutputChunk"("taskId", "sequence");
CREATE INDEX "OutputChunk_taskId_createdAt_idx" ON "OutputChunk"("taskId", "createdAt");

CREATE INDEX "ApprovalRequest_taskId_createdAt_idx" ON "ApprovalRequest"("taskId", "createdAt");
CREATE INDEX "ApprovalRequest_status_idx" ON "ApprovalRequest"("status");

CREATE UNIQUE INDEX "ApprovalResult_approvalRequestId_key" ON "ApprovalResult"("approvalRequestId");
CREATE INDEX "ApprovalResult_taskId_resolvedAt_idx" ON "ApprovalResult"("taskId", "resolvedAt");
CREATE INDEX "ApprovalResult_status_idx" ON "ApprovalResult"("status");

CREATE INDEX "TaskEvent_taskId_createdAt_idx" ON "TaskEvent"("taskId", "createdAt");
CREATE INDEX "TaskEvent_eventName_idx" ON "TaskEvent"("eventName");

ALTER TABLE "OutputChunk" ADD CONSTRAINT "OutputChunk_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalResult" ADD CONSTRAINT "ApprovalResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalResult" ADD CONSTRAINT "ApprovalResult_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
