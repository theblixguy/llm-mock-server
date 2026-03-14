import pc from "picocolors";

export const LEVEL_PRIORITY = {
  none: 0,
  error: 1,
  warning: 2,
  info: 3,
  debug: 4,
  all: 5,
} as const satisfies Record<string, number>;

/** Log verbosity, from `"none"` (silent) through to `"all"` (everything). */
export type LogLevel = keyof typeof LEVEL_PRIORITY;

const LEVEL_STYLE = {
  error: { label: pc.red(pc.bold("ERROR")), symbol: pc.red("✗") },
  warn: { label: pc.yellow(pc.bold("WARN")), symbol: pc.yellow("!") },
  info: { label: pc.cyan("INFO"), symbol: pc.cyan("●") },
  debug: { label: pc.dim("DEBUG"), symbol: pc.dim("·") },
} as const;

export class Logger {
  readonly level: LogLevel;
  private threshold: number;

  constructor(level: LogLevel = "info") {
    this.level = level;
    this.threshold = LEVEL_PRIORITY[level];
  }

  error(msg: string, ...args: unknown[]): void {
    if (this.threshold >= LEVEL_PRIORITY.error) {
      const { label, symbol } = LEVEL_STYLE.error;
      console.error(`${pc.dim(new Date().toISOString())} ${symbol} ${label} ${msg}`, ...args);
    }
  }

  warn(msg: string, ...args: unknown[]): void {
    if (this.threshold >= LEVEL_PRIORITY.warning) {
      const { label, symbol } = LEVEL_STYLE.warn;
      console.warn(`${pc.dim(new Date().toISOString())} ${symbol} ${label} ${msg}`, ...args);
    }
  }

  info(msg: string, ...args: unknown[]): void {
    if (this.threshold >= LEVEL_PRIORITY.info) {
      const { label, symbol } = LEVEL_STYLE.info;
      console.log(`${pc.dim(new Date().toISOString())} ${symbol} ${label} ${msg}`, ...args);
    }
  }

  debug(msg: string, ...args: unknown[]): void {
    if (this.threshold >= LEVEL_PRIORITY.debug) {
      const { label, symbol } = LEVEL_STYLE.debug;
      console.log(`${pc.dim(new Date().toISOString())} ${symbol} ${label} ${pc.dim(msg)}`, ...args);
    }
  }
}
