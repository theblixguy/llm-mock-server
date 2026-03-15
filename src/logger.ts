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

type ConsoleMethod = "error" | "warn" | "log";

const LEVEL_CONFIG: Record<keyof typeof LEVEL_STYLE, { priority: number; method: ConsoleMethod; dim?: boolean }> = {
  error: { priority: LEVEL_PRIORITY.error, method: "error" },
  warn: { priority: LEVEL_PRIORITY.warning, method: "warn" },
  info: { priority: LEVEL_PRIORITY.info, method: "log" },
  debug: { priority: LEVEL_PRIORITY.debug, method: "log", dim: true },
};

export class Logger {
  readonly level: LogLevel;
  private threshold: number;

  constructor(level: LogLevel = "info") {
    this.level = level;
    this.threshold = LEVEL_PRIORITY[level];
  }

  private log(key: keyof typeof LEVEL_STYLE, msg: string, args: unknown[]): void {
    const config = LEVEL_CONFIG[key];
    if (this.threshold < config.priority) return;
    const { label, symbol } = LEVEL_STYLE[key];
    const text = config.dim ? pc.dim(msg) : msg;
    console[config.method](`${pc.dim(new Date().toISOString())} ${symbol} ${label} ${text}`, ...args);
  }

  error(msg: string, ...args: unknown[]): void { this.log("error", msg, args); }
  warn(msg: string, ...args: unknown[]): void { this.log("warn", msg, args); }
  info(msg: string, ...args: unknown[]): void { this.log("info", msg, args); }
  debug(msg: string, ...args: unknown[]): void { this.log("debug", msg, args); }
}
