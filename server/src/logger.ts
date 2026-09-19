type Level = "info" | "warn" | "error";

function emit(level: Level, event: string, data?: Record<string, unknown>) {
  const line = { ts: new Date().toISOString(), level, event, ...data };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const log = {
  info: (event: string, data?: Record<string, unknown>) => emit("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => emit("error", event, data),
  /** Every rejected auth attempt funnels through here. */
  authFailure: (reason: string, data?: Record<string, unknown>) =>
    emit("warn", "auth.failure", { reason, ...data }),
};
