import { open, type Scalar, type SQLBatchTuple } from "@op-engineering/op-sqlite";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AgentTask, ApprovalRequest, OutputChunk } from "@personal-ai-assistant/shared";

const DATABASE_NAME = "personal-ai-assistant-task-history.sqlite";
const LEGACY_STORAGE_KEY = "personal-ai-assistant.task-history.v1";

const db = open({ name: DATABASE_NAME });

export interface TaskHistorySnapshot {
  tasks: AgentTask[];
  outputsByTaskId: Record<string, OutputChunk[]>;
  approvalsByTaskId: Record<string, ApprovalRequest[]>;
}

let databaseReady: Promise<void> | undefined;
let writeQueue: Promise<void> = Promise.resolve();

export async function loadTaskHistoryFromDatabase(): Promise<TaskHistorySnapshot> {
  await ensureDatabaseReady();
  await writeQueue;

  const taskRows = await db.execute(
    "SELECT payload FROM tasks ORDER BY created_at DESC, id DESC"
  );
  const outputRows = await db.execute(
    "SELECT payload FROM outputs ORDER BY task_id ASC, sequence ASC, id ASC"
  );
  const approvalRows = await db.execute(
    "SELECT payload FROM approvals ORDER BY task_id ASC, created_at ASC, id ASC"
  );

  const outputsByTaskId: Record<string, OutputChunk[]> = {};
  for (const chunk of sortOutputs(parsePayloadRows<OutputChunk>(outputRows.rows))) {
    (outputsByTaskId[chunk.taskId] ??= []).push(chunk);
  }

  const approvalsByTaskId: Record<string, ApprovalRequest[]> = {};
  for (const approval of sortApprovals(parsePayloadRows<ApprovalRequest>(approvalRows.rows))) {
    (approvalsByTaskId[approval.taskId] ??= []).push(approval);
  }

  return {
    tasks: sortTasks(parsePayloadRows<AgentTask>(taskRows.rows)),
    outputsByTaskId,
    approvalsByTaskId
  };
}

export async function saveTasksToDatabase(tasks: AgentTask[]) {
  if (tasks.length === 0) {
    return;
  }

  await enqueueWrite(() => executeCommands(tasks.map(toTaskUpsertCommand)));
}

export async function saveTaskToDatabase(task: AgentTask) {
  await enqueueWrite(() => executeCommands([toTaskUpsertCommand(task)]));
}

export async function saveOutputToDatabase(chunk: OutputChunk) {
  await enqueueWrite(() => executeCommands([toOutputUpsertCommand(chunk)]));
}

export async function saveOutputsForTaskToDatabase(taskId: string, outputs: OutputChunk[]) {
  await enqueueWrite(() =>
    executeCommands([
      ["DELETE FROM outputs WHERE task_id = ?", [taskId]],
      ...sortOutputs(outputs).map(toOutputUpsertCommand)
    ])
  );
}

export async function saveApprovalToDatabase(approval: ApprovalRequest) {
  await enqueueWrite(() => executeCommands([toApprovalUpsertCommand(approval)]));
}

export async function saveApprovalsForTaskToDatabase(
  taskId: string,
  approvals: ApprovalRequest[]
) {
  await enqueueWrite(() =>
    executeCommands([
      ["DELETE FROM approvals WHERE task_id = ?", [taskId]],
      ...sortApprovals(approvals).map(toApprovalUpsertCommand)
    ])
  );
}

export async function deleteTaskFromDatabase(taskId: string) {
  await enqueueWrite(() =>
    executeCommands([
      ["DELETE FROM approvals WHERE task_id = ?", [taskId]],
      ["DELETE FROM outputs WHERE task_id = ?", [taskId]],
      ["DELETE FROM tasks WHERE id = ?", [taskId]]
    ])
  );
}

export async function clearTasksFromDatabase(taskIds?: string[]) {
  await enqueueWrite(() => {
    if (!taskIds) {
      return executeCommands([
        ["DELETE FROM approvals"],
        ["DELETE FROM outputs"],
        ["DELETE FROM tasks"]
      ]);
    }

    if (taskIds.length === 0) {
      return Promise.resolve();
    }

    return executeCommands(taskIds.flatMap(toTaskDeleteCommands));
  });
}

function ensureDatabaseReady() {
  databaseReady ??= initializeDatabase();
  return databaseReady;
}

async function initializeDatabase() {
  await db.execute("PRAGMA journal_mode = WAL");
  await db.execute("PRAGMA foreign_keys = ON");
  await db.executeBatch([
    [
      "CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL)"
    ],
    [
      "CREATE TABLE IF NOT EXISTS outputs (id TEXT PRIMARY KEY NOT NULL, task_id TEXT NOT NULL, sequence INTEGER NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL)"
    ],
    [
      "CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY NOT NULL, task_id TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL)"
    ],
    ["CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC)"],
    ["CREATE INDEX IF NOT EXISTS idx_outputs_task_sequence ON outputs(task_id, sequence ASC)"],
    ["CREATE INDEX IF NOT EXISTS idx_approvals_task_created ON approvals(task_id, created_at ASC)"],
    ["PRAGMA user_version = 1"]
  ]);
  await migrateLegacyAsyncStorageSnapshot();
}

async function migrateLegacyAsyncStorageSnapshot() {
  const raw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) {
    return;
  }

  const snapshot = normalizeSnapshot(
    parseJson<Partial<TaskHistorySnapshot>>(raw) ?? createEmptySnapshot()
  );
  const hasLegacyRows =
    snapshot.tasks.length > 0 ||
    Object.keys(snapshot.outputsByTaskId).length > 0 ||
    Object.keys(snapshot.approvalsByTaskId).length > 0;

  if (!hasLegacyRows) {
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
    return;
  }

  const existingCount = await countRows();
  if (existingCount === 0) {
    await replaceDatabaseSnapshot(snapshot);
  }

  await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
}

async function enqueueWrite(operation: () => Promise<void>) {
  const run = async () => {
    await ensureDatabaseReady();
    await operation();
  };

  const result = writeQueue.then(run, run);
  writeQueue = result.catch(() => undefined);
  await result;
}

async function executeCommands(commands: SQLBatchTuple[]) {
  if (commands.length === 0) {
    return;
  }

  await db.executeBatch(commands);
}

async function replaceDatabaseSnapshot(snapshot: TaskHistorySnapshot) {
  await executeCommands([
    ["DELETE FROM approvals"],
    ["DELETE FROM outputs"],
    ["DELETE FROM tasks"],
    ...sortTasks(snapshot.tasks).map(toTaskUpsertCommand),
    ...Object.values(snapshot.outputsByTaskId).flatMap((outputs) =>
      sortOutputs(outputs).map(toOutputUpsertCommand)
    ),
    ...Object.values(snapshot.approvalsByTaskId).flatMap((approvals) =>
      sortApprovals(approvals).map(toApprovalUpsertCommand)
    )
  ]);
}

async function countRows() {
  const result = await db.execute(
    "SELECT (SELECT COUNT(*) FROM tasks) + (SELECT COUNT(*) FROM outputs) + (SELECT COUNT(*) FROM approvals) AS row_count"
  );
  const rowCount = result.rows[0]?.row_count;
  if (typeof rowCount === "number") {
    return rowCount;
  }
  if (typeof rowCount === "string") {
    return Number(rowCount) || 0;
  }
  return 0;
}

function toTaskUpsertCommand(task: AgentTask): SQLBatchTuple {
  return [
    "INSERT OR REPLACE INTO tasks (id, created_at, updated_at, payload) VALUES (?, ?, ?, ?)",
    [task.id, task.createdAt, task.updatedAt, JSON.stringify(task)]
  ];
}

function toOutputUpsertCommand(chunk: OutputChunk): SQLBatchTuple {
  return [
    "INSERT OR REPLACE INTO outputs (id, task_id, sequence, created_at, payload) VALUES (?, ?, ?, ?, ?)",
    [chunk.id, chunk.taskId, chunk.sequence, chunk.createdAt, JSON.stringify(chunk)]
  ];
}

function toApprovalUpsertCommand(approval: ApprovalRequest): SQLBatchTuple {
  return [
    "INSERT OR REPLACE INTO approvals (id, task_id, created_at, payload) VALUES (?, ?, ?, ?)",
    [approval.id, approval.taskId, approval.createdAt, JSON.stringify(approval)]
  ];
}

function toTaskDeleteCommands(taskId: string): SQLBatchTuple[] {
  return [
    ["DELETE FROM approvals WHERE task_id = ?", [taskId]],
    ["DELETE FROM outputs WHERE task_id = ?", [taskId]],
    ["DELETE FROM tasks WHERE id = ?", [taskId]]
  ];
}

function normalizeSnapshot(snapshot: Partial<TaskHistorySnapshot>): TaskHistorySnapshot {
  return {
    tasks: sortTasks(readRecordArray<AgentTask>(snapshot.tasks)),
    outputsByTaskId: normalizeGroupedArray<OutputChunk>(snapshot.outputsByTaskId, sortOutputs),
    approvalsByTaskId: normalizeGroupedArray<ApprovalRequest>(
      snapshot.approvalsByTaskId,
      sortApprovals
    )
  };
}

function parsePayloadRows<Value>(rows: Array<Record<string, Scalar>>) {
  return rows.map((row) => parseRecordPayload<Value>(row.payload)).filter(isDefined);
}

function parseRecordPayload<Value>(payload: Scalar | undefined): Value | undefined {
  if (typeof payload !== "string") {
    return undefined;
  }

  const parsed = parseJson<unknown>(payload);
  return isRecord(parsed) ? (parsed as Value) : undefined;
}

function normalizeGroupedArray<Value>(
  value: unknown,
  sort: (items: Value[]) => Value[]
): Record<string, Value[]> {
  if (!isRecord(value)) {
    return {};
  }

  const normalized: Record<string, Value[]> = {};
  for (const [key, items] of Object.entries(value)) {
    normalized[key] = sort(readRecordArray<Value>(items));
  }
  return normalized;
}

function readRecordArray<Value>(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord).map((item) => item as Value) : [];
}

function createEmptySnapshot(): TaskHistorySnapshot {
  return {
    tasks: [],
    outputsByTaskId: {},
    approvalsByTaskId: {}
  };
}

function sortTasks(tasks: AgentTask[]) {
  return [...tasks].sort((left, right) => {
    const createdDiff = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return createdDiff || right.id.localeCompare(left.id);
  });
}

function sortOutputs(outputs: OutputChunk[]) {
  return [...outputs].sort((left, right) => left.sequence - right.sequence);
}

function sortApprovals(approvals: ApprovalRequest[]) {
  return [...approvals].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
  );
}

function parseJson<Value>(raw: string | null): Value | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as Value;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDefined<Value>(value: Value | undefined): value is Value {
  return value !== undefined;
}
