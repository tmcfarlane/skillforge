type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: unknown;
}

function formatEntry(level: LogLevel, message: string, data?: unknown): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(data !== undefined ? { data } : {}),
  };
}

function write(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug: (message: string, data?: unknown): void => write(formatEntry("debug", message, data)),
  info: (message: string, data?: unknown): void => write(formatEntry("info", message, data)),
  warn: (message: string, data?: unknown): void => write(formatEntry("warn", message, data)),
  error: (message: string, data?: unknown): void => write(formatEntry("error", message, data)),
};
