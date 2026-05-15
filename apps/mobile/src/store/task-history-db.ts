import type { AgentTask, ApprovalRequest, OutputChunk } from "@personal-ai-assistant/shared";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

const DATABASE_NAME = "personal_ai_task_history.db";

export interface TaskHistorySnapshot {
  tasks: AgentTask[];
  outputsByTaskId: Record<string, OutputChunk[]>;
  approvalsByTaskId: Record<string, ApprovalRequest[]>;
}

interface JsonRow {
  json: string;
}

let databasePromise: Promise<SQLiteDatabase> | undefined;

export async function loadTaskHistoryFromDatabase(): Promise<TaskHistorySnapshot> {
  const db = await getDatabase();
  const taskRows = await db.getAllAsync<JsonRow>(
    "SELECT task_json AS json FROM agent_tasks ORDER BY created_at DESC, id DESC"
  );
  const outputRows = await db.getAllAsync<JsonRow>(
    "SELECT chunk_json AS json FROM output_chunks ORDER BY task_id ASC, sequence ASC"
  );
  const approvalRows = await db.getAllAsync<JsonRow>(
    "SELECT approval_json AS json FROM approval_requests ORDER BY task_id ASC, created_at ASC"
  );

  const tasks = taskRows.map((row) => parseJson<AgentTask>(row.json)).filter(isPresent);
  const outputsByTaskId: Record<string, OutputChunk[]> = {};
  const approvalsByTaskId: Record<string, ApprovalRequest[]> = {};

  for (const chunk of outputRows.map((row) => parseJson<OutputChunk>(row.json)).filter(isPresent)) {
    outputsByTaskId[chunk.taskId] = [...(outputsByTaskId[chunk.taskId] ?? []), chunk];
  }

  for (const approval of approvalRows
    .map((row) => parseJson<ApprovalRequest>(row.json))
    .filter(isPresent)) {
    approvalsByTaskId[approval.taskId] = [
      ...(approvalsByTaskId[approval.taskId] ?? []),
      approval
    ];
  }

  return {
    tasks,
    outputsByTaskId,
    approvalsByTaskId
  };
}

export async function saveTasksToDatabase(tasks: AgentTask[]) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const task of tasks) {
      await saveTask(db, task);
    }
  });
}

export async function saveTaskToDatabase(task: AgentTask) {
  const db = await getDatabase();
  await saveTask(db, task);
}

export async function saveOutputToDatabase(chunk: OutputChunk) {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO output_chunks
      (id, task_id, sequence, stream, created_at, chunk_json)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [chunk.id, chunk.taskId, chunk.sequence, chunk.stream, chunk.createdAt, JSON.stringify(chunk)]
  );
}

export async function saveOutputsForTaskToDatabase(taskId: string, outputs: OutputChunk[]) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM output_chunks WHERE task_id = ?", [taskId]);
    for (const output of outputs) {
      await db.runAsync(
        `INSERT OR REPLACE INTO output_chunks
          (id, task_id, sequence, stream, created_at, chunk_json)
          VALUES (?, ?, ?, ?, ?, ?)`,
        [
          output.id,
          output.taskId,
          output.sequence,
          output.stream,
          output.createdAt,
          JSON.stringify(output)
        ]
      );
    }
  });
}

export async function saveApprovalToDatabase(approval: ApprovalRequest) {
  const db = await getDatabase();
  await saveApproval(db, approval);
}

export async function saveApprovalsForTaskToDatabase(
  taskId: string,
  approvals: ApprovalRequest[]
) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM approval_requests WHERE task_id = ?", [taskId]);
    for (const approval of approvals) {
      await saveApproval(db, approval);
    }
  });
}

export async function deleteTaskFromDatabase(taskId: string) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM output_chunks WHERE task_id = ?", [taskId]);
    await db.runAsync("DELETE FROM approval_requests WHERE task_id = ?", [taskId]);
    await db.runAsync("DELETE FROM agent_tasks WHERE id = ?", [taskId]);
  });
}

export async function clearTasksFromDatabase(taskIds?: string[]) {
  const db = await getDatabase();
  if (!taskIds) {
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM output_chunks", []);
      await db.runAsync("DELETE FROM approval_requests", []);
      await db.runAsync("DELETE FROM agent_tasks", []);
    });
    return;
  }

  if (taskIds.length === 0) {
    return;
  }

  const placeholders = taskIds.map(() => "?").join(", ");
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM output_chunks WHERE task_id IN (${placeholders})`, taskIds);
    await db.runAsync(`DELETE FROM approval_requests WHERE task_id IN (${placeholders})`, taskIds);
    await db.runAsync(`DELETE FROM agent_tasks WHERE id IN (${placeholders})`, taskIds);
  });
}

async function getDatabase() {
  databasePromise ??= openDatabaseAsync(DATABASE_NAME).then(async (db) => {
    await db.execAsync(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS agent_tasks (
        id TEXT PRIMARY KEY NOT NULL,
        device_id TEXT NOT NULL,
        assigned_desktop_device_id TEXT,
        status TEXT NOT NULL,
        prompt TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        task_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_agent_tasks_device_created
        ON agent_tasks(device_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_status
        ON agent_tasks(status);

      CREATE TABLE IF NOT EXISTS output_chunks (
        id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        stream TEXT NOT NULL,
        created_at TEXT NOT NULL,
        chunk_json TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_output_chunks_task_sequence
        ON output_chunks(task_id, sequence);

      CREATE TABLE IF NOT EXISTS approval_requests (
        id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        approval_json TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_approval_requests_task_created
        ON approval_requests(task_id, created_at);
    `);
    return db;
  });

  return databasePromise;
}

async function saveTask(db: SQLiteDatabase, task: AgentTask) {
  await db.runAsync(
    `INSERT OR REPLACE INTO agent_tasks
      (id, device_id, assigned_desktop_device_id, status, prompt, created_at, updated_at, task_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      task.createdByDeviceId,
      task.assignedDesktopDeviceId ?? null,
      task.status,
      task.prompt,
      task.createdAt,
      task.updatedAt,
      JSON.stringify(task)
    ]
  );
}

async function saveApproval(db: SQLiteDatabase, approval: ApprovalRequest) {
  await db.runAsync(
    `INSERT OR REPLACE INTO approval_requests
      (id, task_id, status, created_at, approval_json)
      VALUES (?, ?, ?, ?, ?)`,
    [
      approval.id,
      approval.taskId,
      approval.status,
      approval.createdAt,
      JSON.stringify(approval)
    ]
  );
}

function parseJson<Value>(raw: string): Value | undefined {
  try {
    return JSON.parse(raw) as Value;
  } catch {
    return undefined;
  }
}

function isPresent<Value>(value: Value | undefined): value is Value {
  return value !== undefined;
}
