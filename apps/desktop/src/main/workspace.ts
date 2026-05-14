import { stat } from "node:fs/promises";

export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspacePathError";
  }
}

export function getWorkspacePathFromTaskMetadata(
  metadata: Record<string, unknown> | undefined
): string | undefined {
  const workspacePath = metadata?.workspacePath;
  return typeof workspacePath === "string" ? workspacePath : undefined;
}

export function resolveWorkspacePath(
  taskWorkspacePath: string | undefined,
  defaultWorkspacePath: string | undefined
) {
  return taskWorkspacePath?.trim() || defaultWorkspacePath?.trim();
}

export async function assertValidWorkspacePath(workspacePath: string | undefined): Promise<string> {
  const normalized = workspacePath?.trim();
  if (!normalized) {
    throw new WorkspacePathError("workspacePath is required and cannot be empty");
  }

  let stats;
  try {
    stats = await stat(normalized);
  } catch {
    throw new WorkspacePathError(`workspacePath does not exist: ${normalized}`);
  }

  if (!stats.isDirectory()) {
    throw new WorkspacePathError(`workspacePath must be a directory: ${normalized}`);
  }

  return normalized;
}
