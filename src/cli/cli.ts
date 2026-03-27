#!/usr/bin/env node

import { watch } from "node:fs";
import { createRequire } from "node:module";
import { Command } from "commander";
import pc from "picocolors";
import { MockServer } from "#/mock-server.js";
import { Logger } from "#/logger.js";
import {
  parsePort,
  parseHost,
  parseLogLevel,
  parseChunkSize,
  parseLatency,
} from "./validators.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

const WATCH_DEBOUNCE_MS = 100;

interface StartOptions {
  port: string;
  host: string;
  rules?: string;
  latency: string;
  chunkSize: string;
  fallback?: string;
  logLevel: string;
  watch?: boolean;
}

async function start(options: StartOptions): Promise<void> {
  const logLevel = parseLogLevel(options.logLevel);
  const logger = new Logger(logLevel);
  const port = parsePort(options.port);
  const host = await parseHost(options.host);
  const latency = parseLatency(options.latency);
  const chunkSize = parseChunkSize(options.chunkSize);

  const server = new MockServer({
    port,
    host,
    logLevel,
    ...(latency > 0 && { defaultLatency: latency }),
    ...(chunkSize > 0 && { defaultChunkSize: chunkSize }),
  });

  if (options.fallback) {
    server.fallback(options.fallback);
  }

  if (options.rules) {
    await server.load(options.rules);
  }

  const quiet = logLevel === "none";

  await server.start(port);

  if (!quiet) {
    console.log();
    console.log(
      `  ${pc.bold(pc.cyan("llm-mock-server"))} ${pc.dim(`v${version}`)}`,
    );
    console.log();
    console.log(`  ${pc.dim("Port")}       ${pc.bold(String(port))}`);
    console.log(
      `  ${pc.dim("Rules")}      ${pc.bold(String(server.ruleCount))} loaded`,
    );
    if (latency > 0) {
      console.log(
        `  ${pc.dim("Latency")}    ${pc.bold(`${String(latency)}ms`)} per chunk`,
      );
    }
    console.log(
      `  ${pc.dim("Endpoints")}  ${server.routes.map((r) => pc.green(r)).join(", ")}`,
    );
    console.log();
  }

  if (options.watch && options.rules) {
    const rulesPath = options.rules;
    let timer: ReturnType<typeof setTimeout> | undefined;
    watch(rulesPath, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          server.reset();
          await server.load(rulesPath);
          if (options.fallback) server.fallback(options.fallback);
          logger.info(`Reloaded rules from ${rulesPath}`);
        } catch (err) {
          logger.error("Failed to reload rules", err);
        }
      }, WATCH_DEBOUNCE_MS);
    });
    logger.info(`Watching ${rulesPath} for changes`);
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`Got ${signal}, shutting down...`);
    await server.stop();
    logger.info("Clean shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT").catch(() => process.exit(1));
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM").catch(() => process.exit(1));
  });
}

const program = new Command()
  .name("llm-mock-server")
  .description("Mock LLM server for deterministic testing")
  .version(version);

program
  .command("start", { isDefault: true })
  .description("Start the mock server")
  .option("-p, --port <number>", "port to listen on", "5555")
  .option("-H, --host <address>", "host to bind to", "127.0.0.1")
  .option("-r, --rules <path>", "path to rules file or directory")
  .option("-l, --latency <ms>", "latency between SSE chunks (ms)", "0")
  .option("-c, --chunk-size <chars>", "characters per SSE chunk", "0")
  .option("-f, --fallback <text>", "fallback reply text")
  .option("-w, --watch", "watch rules path and reload on changes")
  .option("--log-level <level>", "log verbosity", "info")
  .action((options: StartOptions) => start(options));

program.parseAsync().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
