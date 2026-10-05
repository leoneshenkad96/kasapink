import pino from "pino";

const isDev =
  process.env.NODE_ENV === "development" &&
  !process.env.VERCEL &&
  process.env.ENABLE_PINO_PRETTY === "true";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});