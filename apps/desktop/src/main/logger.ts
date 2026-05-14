export class Logger {
  constructor(private readonly scope: string) {}

  info(message: string, context?: Record<string, unknown>) {
    console.info(this.format("info", message, context));
  }

  warn(message: string, context?: Record<string, unknown>) {
    console.warn(this.format("warn", message, context));
  }

  error(message: string, context?: Record<string, unknown>) {
    console.error(this.format("error", message, context));
  }

  private format(level: string, message: string, context?: Record<string, unknown>) {
    const prefix = `[desktop:${this.scope}] ${level}: ${message}`;
    return context ? `${prefix} ${JSON.stringify(context)}` : prefix;
  }
}
