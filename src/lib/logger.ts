import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";
export const logger = pino(
  isDev
    ? {
        level: process.env.LOG_LEVEL ?? "info",
        // Use basic console output in development to avoid worker thread issues
        transport: undefined,
      }
    : { level: process.env.LOG_LEVEL ?? "info" },
);
