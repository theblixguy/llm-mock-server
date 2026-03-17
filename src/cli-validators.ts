import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { LEVEL_PRIORITY, type LogLevel } from "./logger.js";

const VALID_LOG_LEVELS: string[] = Object.keys(LEVEL_PRIORITY);

function parseStrictInt(value: string): number {
  if (!/^\d+$/.test(value)) return NaN;
  return Number(value);
}

const MAX_PORT = 65535;

export function parsePort(value: string): number {
  const port = parseStrictInt(value);
  if (isNaN(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`Invalid port "${value}". Must be 1-${String(MAX_PORT)}.`);
  }
  return port;
}

export function parseLogLevel(value: string): LogLevel {
  if (!VALID_LOG_LEVELS.includes(value)) {
    throw new Error(
      `Invalid log level "${value}". Valid: ${VALID_LOG_LEVELS.join(", ")}`,
    );
  }
  return value as LogLevel;
}

export async function parseHost(value: string): Promise<string> {
  if (!value) {
    throw new Error(
      `Invalid host "${value}". Must be a resolvable hostname or IP address.`,
    );
  }
  if (value === "localhost" || isIP(value) !== 0) {
    return value;
  }
  try {
    await lookup(value);
    return value;
  } catch {
    throw new Error(
      `Invalid host "${value}". Must be a resolvable hostname or IP address.`,
    );
  }
}

export function parseChunkSize(value: string): number {
  const size = parseStrictInt(value);
  if (isNaN(size) || size < 0) {
    throw new Error(
      `Invalid chunk size "${value}". Must be a non-negative integer.`,
    );
  }
  return size;
}

export function parseLatency(value: string): number {
  const ms = parseStrictInt(value);
  if (isNaN(ms) || ms < 0) {
    throw new Error(
      `Invalid latency "${value}". Must be a non-negative integer (ms).`,
    );
  }
  return ms;
}
