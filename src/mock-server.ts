import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { Reply, ReplyOptions } from "./types/reply.js";
import type { RuleSummary } from "./types/rule.js";
import { RuleEngine } from "./rule-engine.js";
import { RuleBuilder } from "./rule-builder.js";
import { RequestHistory } from "./history.js";
import { chatCompletionsFormat } from "./formats/openai/chat-completions/index.js";
import { anthropicFormat } from "./formats/anthropic/index.js";
import { responsesFormat } from "./formats/openai/responses/index.js";
import type { Format } from "./formats/types.js";
import { Logger } from "./logger.js";
import type { LogLevel } from "./logger.js";
import { createRouteHandler } from "./route-handler.js";

const formats: readonly Format[] = [
  chatCompletionsFormat,
  anthropicFormat,
  responsesFormat,
];

export interface MockServerOptions {
  readonly port?: number;
  /** Defaults to `"127.0.0.1"`. Set to `"0.0.0.0"` to listen on all interfaces. */
  readonly host?: string;
  /** Defaults to `"none"` (silent). */
  readonly logLevel?: LogLevel;
  /** Default ms delay between SSE chunks. Individual rules can override this. */
  readonly defaultLatency?: number;
  /** Default characters per SSE text chunk. Individual rules can override this. */
  readonly defaultChunkSize?: number;
}

/**
 * Mock LLM server that handles OpenAI Chat Completions, Anthropic Messages, and OpenAI Responses API formats.
 * Register rules with `when()`, point your SDK at `url`, and go.
 *
 * Supports `await using` for automatic cleanup.
 *
 * @example
 * ```ts
 * const server = new MockServer({ logLevel: "info" });
 * server.when("hello").reply("Hi there!");
 * await server.start();
 * // Point your client at server.url
 * await server.stop();
 * ```
 */

type RuleAPI = Pick<
  RuleBuilder,
  "when" | "whenTool" | "whenToolResult" | "nextError"
>;

export class MockServer implements RuleAPI {
  private readonly app: FastifyInstance;
  private readonly engine = new RuleEngine();
  private readonly rules_ = new RuleBuilder(this.engine);
  private readonly history_ = new RequestHistory();
  private readonly logger: Logger;
  private readonly host: string;
  private readonly defaultOptions: ReplyOptions;
  private fallbackReply: Reply = "Mock server: no matching rule.";
  private listening = false;

  /** @see RuleBuilder.when */
  when = this.rules_.when.bind(this.rules_);
  /** @see RuleBuilder.whenTool */
  whenTool = this.rules_.whenTool.bind(this.rules_);
  /** @see RuleBuilder.whenToolResult */
  whenToolResult = this.rules_.whenToolResult.bind(this.rules_);
  /** @see RuleBuilder.nextError */
  nextError = this.rules_.nextError.bind(this.rules_);

  constructor(options: MockServerOptions = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.logger = new Logger(options.logLevel ?? "none");
    this.defaultOptions = {
      ...(options.defaultLatency !== undefined && {
        latency: options.defaultLatency,
      }),
      ...(options.defaultChunkSize !== undefined && {
        chunkSize: options.defaultChunkSize,
      }),
    };
    this.app = Fastify({ logger: false });

    const deps = {
      engine: this.engine,
      history: this.history_,
      logger: this.logger,
      defaultOptions: this.defaultOptions,
      getFallback: () => this.fallbackReply,
    };

    for (const format of formats) {
      this.app.post(format.route, createRouteHandler(format, deps));
    }
  }

  /** Set the reply used when no rule matches. Defaults to a generic message. */
  fallback(reply: Reply): void {
    this.fallbackReply = reply;
  }

  /** Load rules from a `.json5` file, a `.ts`/`.js` handler file, or a directory containing them. */
  async load(pathOrDir: string): Promise<void> {
    const before = this.engine.ruleCount;
    const { loadRulesFromPath } = await import("./loader.js");
    await loadRulesFromPath(pathOrDir, {
      engine: this.engine,
      setFallback: (reply) => {
        this.fallbackReply = reply;
      },
    });
    const loaded = this.engine.ruleCount - before;
    this.logger.info(
      `Loaded ${loaded} rule${loaded !== 1 ? "s" : ""} from ${pathOrDir}`,
    );
  }

  /** Every request the server has handled. */
  get history(): RequestHistory {
    return this.history_;
  }

  /** Returns `true` when all rules with a `.times()` limit have been consumed. */
  isDone(): boolean {
    return this.engine.isDone();
  }

  /** Clear all rules, request history, and reset the fallback to its default. */
  reset(): void {
    this.engine.clear();
    this.history_.clear();
    this.fallbackReply = "Mock server: no matching rule.";
    this.logger.info("Server reset: rules and history cleared");
  }

  /** The base URL the server is listening on, e.g. `http://127.0.0.1:12345`. Throws if the server hasn't started. */
  get url(): string {
    if (!this.listening)
      throw new Error("Server is not running. Call start() first.");
    const addr = this.app.server.address();
    const port = addr !== null && typeof addr === "object" ? addr.port : 0;
    return `http://${this.host}:${port}`;
  }

  /** The API routes registered on this server, e.g. `["/v1/chat/completions", ...]`. */
  get routes(): readonly string[] {
    return formats.map((f) => f.route);
  }

  get ruleCount(): number {
    return this.engine.ruleCount;
  }

  /** A snapshot of all registered rules with their descriptions and remaining match counts. */
  get rules(): readonly RuleSummary[] {
    return this.engine.describe();
  }

  /** Start listening. Pass `0` (the default) for a random port. */
  async start(port = 0): Promise<void> {
    if (this.listening) throw new Error("Server is already running.");
    await this.app.listen({ port, host: this.host });
    this.listening = true;
    this.logger.info(`Listening on ${this.url}`);
  }

  async stop(): Promise<void> {
    if (!this.listening) return;
    await this.app.close();
    this.listening = false;
    this.logger.info("Server stopped");
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.stop();
  }
}
