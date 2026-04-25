/**
 * Production-level logger utility
 * Respects NODE_ENV to control output verbosity
 */
const isDev = process.env.NODE_ENV !== "production";

const logger = {
  info: (message, data = null) => {
    if (isDev) {
      console.log(`[INFO] ${message}`, data || "");
    }
  },

  error: (message, error = null) => {
    console.error(`[ERROR] ${message}`, error?.message || error || "");
    if (isDev && error?.stack) {
      console.error(error.stack);
    }
  },

  warn: (message, data = null) => {
    if (isDev) {
      console.warn(`[WARN] ${message}`, data || "");
    }
  },

  debug: (message, data = null) => {
    if (isDev) {
      console.debug(`[DEBUG] ${message}`, data || "");
    }
  },
};

export default logger;
