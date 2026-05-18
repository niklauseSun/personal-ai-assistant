export type ServerHealthStatus = "available" | "unavailable";

export interface ServerHealthResult {
  status: ServerHealthStatus;
  message: string;
  checkedAt: string;
}

interface PingServerHealthOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

export function buildHealthUrl(serverUrl: string) {
  return `${serverUrl.trim().replace(/\/$/, "")}/health`;
}

export async function pingServerHealth(
  serverUrl: string,
  options: PingServerHealthOptions = {}
): Promise<ServerHealthResult> {
  const normalizedServerUrl = serverUrl.trim();
  if (!normalizedServerUrl) {
    return unavailableResult("Enter a server URL before pinging.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await (options.fetcher ?? fetch)(buildHealthUrl(normalizedServerUrl), {
      signal: controller.signal
    });

    if (response.ok) {
      return {
        status: "available",
        message: `Server reachable at ${normalizedServerUrl}.`,
        checkedAt: new Date().toISOString()
      };
    }

    return unavailableResult(`Health check returned HTTP ${response.status}.`);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return unavailableResult("Health check timed out.");
    }

    return unavailableResult(error instanceof Error ? error.message : "Health check failed.");
  } finally {
    clearTimeout(timeout);
  }
}

function unavailableResult(message: string): ServerHealthResult {
  return {
    status: "unavailable",
    message,
    checkedAt: new Date().toISOString()
  };
}
