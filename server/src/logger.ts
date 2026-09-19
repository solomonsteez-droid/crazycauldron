import { writeLogLine } from "./monitoring.js";

type Level = "info" | "warn" | "error";

/**
 * One JSON object per line, to the console and to a rotating file.
 *
 * Both, not either. The console is what a developer reads and what a container
 * runtime collects; the file is what survives a process that died at 3am on a
 * box nobody was watching. Writing the same bytes to both means the two never
 * disagree about what happened.
 */
function emit(level: Level, event: string, data?: Record<string, unknown>) {
  const line = { ts: new Date().toISOString(), level, event, ...data };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
  writeLogLine(text);
}

export const log = {
  info: (event: string, data?: Record<string, unknown>) => emit("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => emit("error", event, data),
  /** Every rejected auth attempt funnels through here. */
  authFailure: (reason: string, data?: Record<string, unknown>) =>
    emit("warn", "auth.failure", { reason, ...data }),
};
