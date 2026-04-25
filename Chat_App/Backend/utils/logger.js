// utils/logger.js — simple levelled logger
const isDev = process.env.NODE_ENV !== "production";

const logger = {
  info: (msg, ...args) => console.log(`[INFO]  ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN]  ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  debug: (msg, ...args) => { if (isDev) console.debug(`[DEBUG] ${msg}`, ...args); },
};

export default logger;