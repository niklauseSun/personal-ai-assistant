import { format, t } from "../ui/i18n";

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function formatTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(date: Date) {
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

export function formatRelativeTimestamp(iso: string, now: Date = new Date()): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }

  const diffMs = now.getTime() - parsed.getTime();
  if (diffMs < 60_000) {
    return t.command.relativeJustNow;
  }

  const today = startOfDay(now);
  const parsedDay = startOfDay(parsed);
  const dayDiff = Math.round((today.getTime() - parsedDay.getTime()) / 86_400_000);

  if (dayDiff === 0) {
    return format(t.command.relativeToday, { time: formatTime(parsed) });
  }

  if (dayDiff === 1) {
    return format(t.command.relativeYesterday, { time: formatTime(parsed) });
  }

  return format(t.command.relativeDate, {
    date: formatDate(parsed),
    time: formatTime(parsed)
  });
}

export function formatDurationLabel(startIso: string, endIso?: string): string | undefined {
  const start = Date.parse(startIso);
  if (Number.isNaN(start)) {
    return undefined;
  }

  const end = endIso ? Date.parse(endIso) : Date.now();
  if (Number.isNaN(end) || end <= start) {
    return undefined;
  }

  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) {
    return format(t.command.durationLabel, { value: `${seconds}s` });
  }

  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return format(t.command.durationLabel, {
      value: remainder ? `${minutes}m${pad(remainder)}s` : `${minutes}m`
    });
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return format(t.command.durationLabel, {
    value: minutes ? `${hours}h${pad(minutes)}m` : `${hours}h`
  });
}

export function deriveCommandTitle(prompt: string): string {
  const trimmed = prompt.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
  const compact = trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
  return compact ? `${t.command.titlePrefix} "${compact}"` : t.command.titlePrefix;
}

export function deriveCommandDescription(
  prompt: string,
  workspacePath?: string
): string | undefined {
  const lines = prompt.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    return lines.slice(1).join(" ").slice(0, 120);
  }

  return workspacePath?.trim() || undefined;
}
