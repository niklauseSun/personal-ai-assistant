# Personal AI Assistant Architecture

## 1. Recommended Directory Structure

```text
personal-ai-assistant/
  apps/
    mobile/                 # React Native + TypeScript
      App.tsx
      app.json
      package.json
      tsconfig.json
    desktop/                # Electron + React + TypeScript + Node.js
      index.html
      package.json
      vite.config.ts
      tsconfig.json
      tsconfig.node.json
      src/
        main/
          main.ts
          preload.ts
        renderer/
          App.tsx
          main.tsx
          styles.css
    server/                 # NestJS + TypeScript + WebSocket
      package.json
      tsconfig.json
      src/
        main.ts
        app.module.ts
        app.controller.ts
        tasks/
          task-events.gateway.ts
    packages/
      shared/               # Shared TypeScript contracts
        package.json
        tsconfig.json
        src/
          index.ts
          models.ts
          ws-events.ts
  docs/
    architecture.md
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
```

## 2. Core Data Model

SQLite is the first persistence target. The model is intentionally relational and portable so the storage adapter can later move to PostgreSQL without changing app-level contracts.

| Model | Purpose | Key Fields |
| --- | --- | --- |
| `DeviceSession` | Simulated device binding before real auth exists. | `deviceId`, `role`, `status`, `displayName`, `registeredAt`, `lastSeenAt` |
| `AgentTask` | One mobile prompt and one Codex execution lifecycle. | `id`, `prompt`, `createdByDeviceId`, `assignedDesktopDeviceId`, `status`, timestamps |
| `OutputChunk` | Ordered stdout/stderr/system chunks. | `id`, `taskId`, `stream`, `sequence`, `content`, `createdAt` |
| `ApprovalRequest` | A Codex approval checkpoint that mobile can approve or reject. | `id`, `taskId`, `status`, `title`, `message`, `command`, `metadata`, timestamps |
| `TaskStateEvent` | Audit trail for status changes. | `id`, `taskId`, `fromStatus`, `toStatus`, `reason`, `createdAt` |

Initial status flow:

```text
QUEUED -> CREATED -> STARTED -> RUNNING -> WAITING_APPROVAL -> RUNNING -> COMPLETED
                                                        |                    |
                                                        v                    v
                                                     CANCELLED             FAILED
```

## 3. WebSocket Event Protocol

Transport can be Socket.IO in the NestJS server while keeping payload names transport-neutral in `packages/shared`.

Client-to-server events:

| Event | Sender | Purpose |
| --- | --- | --- |
| `device.register` | mobile, desktop | Register or refresh a simulated `deviceId`. |
| `task.create` | mobile | Create a task from a prompt. |
| `task.approval.submit` | mobile | Approve or reject a pending approval request. |
| `task.cancel` | mobile, desktop | Request cancellation of a running task. |

Server-to-client events:

| Event | Receiver | Purpose |
| --- | --- | --- |
| `device.online` | mobile, desktop | Confirm simulated binding and announce online status. |
| `task.created` | mobile | Confirm task creation. |
| `task.started` | mobile, desktop | Broadcast that Codex execution has started. |
| `task.output` | mobile, desktop | Broadcast ordered output chunks. |
| `task.waiting_approval` | mobile | Ask for approve/reject. |
| `task.approval.result` | mobile, desktop | Broadcast approval decision. |
| `task.completed` | mobile, desktop | Broadcast successful completion. |
| `task.failed` | mobile, desktop | Broadcast failure with structured error. |
| `task.cancel` | mobile, desktop | Broadcast cancellation state. |

## 4. Implementation Plan

### Phase 1: Monorepo Foundation

- Create workspace layout for mobile, desktop, server, and shared package.
- Define shared TypeScript data models and WebSocket payload contracts.
- Add a minimal NestJS server with `GET /api/health` and a WebSocket gateway shell.
- Add empty mobile and desktop screens.
- Verify the server can start.

### Phase 2: SQLite Persistence

- Add a storage layer with SQLite as the first adapter.
- Create migrations for devices, tasks, task outputs, approval requests, and task state events.
- Implement repository methods around shared contracts.
- Add API/service tests for persistence and history reads.

### Phase 3: Device Binding and Task Creation

- Implement `device.register`, `device.online`, and `task.create`.
- Persist devices and tasks.
- Assign queued tasks to the active desktop device.
- Add basic task list/history views.

### Phase 4: Desktop Codex Runner

- Launch Codex CLI from desktop via `child_process` first; evaluate `node-pty` if interactive terminal behavior is required.
- Stream stdout/stderr back through WebSocket.
- Persist ordered outputs and status changes server-side.

### Phase 5: Approval Loop

- Detect Codex approval prompts in the desktop runner.
- Persist `ApprovalRequest` records.
- Send `task.waiting_approval` to mobile.
- Forward `task.approval.submit` results back to the desktop runner.

### Phase 6: Hardening and Upgrade Path

- Add reconnection, replay-from-sequence, and task cancellation.
- Add real authentication and replace simulated `deviceId` binding.
- Introduce a database adapter boundary and migrate SQLite to PostgreSQL.
- Add packaging for desktop and mobile builds.

## 5. Phase 1 Files

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `.gitignore`
- `docs/architecture.md`
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/src/index.ts`
- `packages/shared/src/models.ts`
- `packages/shared/src/ws-events.ts`
- `apps/server/package.json`
- `apps/server/tsconfig.json`
- `apps/server/src/main.ts`
- `apps/server/src/app.module.ts`
- `apps/server/src/app.controller.ts`
- `apps/server/src/tasks/task-events.gateway.ts`
- `apps/desktop/package.json`
- `apps/desktop/tsconfig.json`
- `apps/desktop/tsconfig.node.json`
- `apps/desktop/vite.config.ts`
- `apps/desktop/index.html`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/preload.ts`
- `apps/desktop/src/renderer/main.tsx`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/mobile/package.json`
- `apps/mobile/tsconfig.json`
- `apps/mobile/app.json`
- `apps/mobile/App.tsx`
